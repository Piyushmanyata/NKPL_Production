const { exec } = require('child_process');
const http = require('http');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cmd = `"${edgePath}" --headless --remote-debugging-port=9222 --user-data-dir=C:\\temp\\edge-charts-check http://localhost:3000`;
console.log('Starting Edge...');
const edgeProcess = exec(cmd);

setTimeout(() => {
  http.get('http://127.0.0.1:9222/json/list', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const targets = JSON.parse(data);
        const target = targets.find(t => t.url.includes('localhost:3000'));
        if (!target) {
          console.log('No local target found. Targets:', data);
          edgeProcess.kill();
          process.exit(1);
        }
        
        console.log('Connecting to WebSocket:', target.webSocketDebuggerUrl);
        const ws = new WebSocket(target.webSocketDebuggerUrl);
        
        ws.onopen = () => {
          ws.send(JSON.stringify({ id: 1, method: 'Console.enable' }));
          ws.send(JSON.stringify({ id: 2, method: 'Runtime.enable' }));
          
          // Inject mock data into localStorage
          const injectMockData = `
            (function() {
              const LS_INDEX = 'nkpl_index_v1';
              const LS_PREFIX = 'nkpl_lines_v2:';
              const dates = ['2026-06-15', '2026-06-14', '2026-06-13', '2026-06-12'];
              
              localStorage.setItem(LS_INDEX, JSON.stringify(dates));
              
              dates.forEach(date => {
                const sheet = {
                  date: date,
                  tolerance: 1.5,
                  updatedAt: new Date().toISOString(),
                  lines: [
                    { machine: 'Machine 1', shift: 'A', item: 'Star 120 gm 130 mm', cycleTime: 22, cavity: 32, hours: 10, grammage: 120, kgPerBag: 30, actualBags: 350, remark: 'Normal run' },
                    { machine: 'Machine 2', shift: 'B', item: 'Star 120 gm 130 mm', cycleTime: 24, cavity: 32, hours: 8, grammage: 120, kgPerBag: 30, actualBags: 250, remark: 'Slight drag' }
                  ]
                };
                localStorage.setItem(LS_PREFIX + date, JSON.stringify(sheet));
              });
              
              localStorage.setItem('nkpl_date_v2', '2026-06-15');
              console.log('Mock data injected successfully');
            })();
          `;
          
          ws.send(JSON.stringify({
            id: 20,
            method: 'Runtime.evaluate',
            params: { expression: injectMockData }
          }));
          
          setTimeout(() => {
            ws.send(JSON.stringify({ id: 21, method: 'Page.reload' }));
          }, 1000);
        };
        
        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          
          if (msg.method === 'Console.messageAdded') {
            console.log('[BROWSER CONSOLE]', msg.params.message.text);
          } else if (msg.method === 'Runtime.consoleAPICalled') {
            const args = msg.params.args.map(arg => arg.value || arg.description || '').join(' ');
            console.log('[BROWSER CONSOLE LOG]', args);
          } else if (msg.method === 'Runtime.exceptionThrown') {
            console.error('[BROWSER EXCEPTION]', JSON.stringify(msg.params.exceptionDetails, null, 2));
          } else if (msg.id === 21) {
            ws.send(JSON.stringify({ id: 22, method: 'Page.enable' }));
          } else if (msg.method === 'Page.loadEventFired') {
            console.log('Page loaded! Clicking Weekly View...');
            ws.send(JSON.stringify({
              id: 23,
              method: 'Runtime.evaluate',
              params: {
                expression: "document.querySelector('.tab-btn[data-view=\"weekly\"]').click();"
              }
            }));
            
            // Wait for rendering and check status of elements
            setTimeout(() => {
              const checkScript = `
                (function() {
                  const results = {};
                  results.typeofChart = typeof Chart;
                  results.activeCharts = window.activeCharts ? {
                    weeklyLength: window.activeCharts.weekly ? window.activeCharts.weekly.length : null,
                    monthlyLength: window.activeCharts.monthly ? window.activeCharts.monthly.length : null
                  } : null;
                  
                  // Check DOM canvas IDs
                  const canvasIds = [
                    'weeklyDailyTrendChart',
                    'weeklyProductMixChart',
                    'weeklyMachinePerformanceChart',
                    'weeklyMachineRuntimeChart',
                    'weeklyMachineEfficiencyChart',
                    'weeklyMachineProductChart'
                  ];
                  
                  results.canvasStatus = canvasIds.map(id => {
                    const el = document.getElementById(id);
                    if (!el) return { id, exists: false };
                    const style = window.getComputedStyle(el);
                    return {
                      id,
                      exists: true,
                      width: el.width,
                      height: el.height,
                      clientWidth: el.clientWidth,
                      clientHeight: el.clientHeight,
                      display: style.display,
                      visibility: style.visibility
                    };
                  });
                  
                  return results;
                })()
              `;
              ws.send(JSON.stringify({
                id: 30,
                method: 'Runtime.evaluate',
                params: { expression: checkScript, returnByValue: true }
              }));
            }, 2000);
          } else if (msg.id === 30) {
            console.log('=== DIAGNOSTIC RESULTS ===');
            console.log(JSON.stringify(msg.result.result.value, null, 2));
            console.log('==========================');
            ws.close();
            edgeProcess.kill();
            process.exit(0);
          }
        };
      } catch (err) {
        console.error('Failed to parse target JSON:', err);
        edgeProcess.kill();
        process.exit(1);
      }
    });
  }).on('error', (err) => {
    console.error('Failed to connect to debugger port:', err);
    edgeProcess.kill();
    process.exit(1);
  });
}, 3000);
