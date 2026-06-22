const { exec } = require('child_process');
const http = require('http');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const cmd = `"${edgePath}" --headless --remote-debugging-port=9222 --user-data-dir=C:\\temp\\edge-dump-html http://localhost:3000`;
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
          edgeProcess.kill();
          process.exit(1);
        }
        
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
          if (msg.method === 'Page.loadEventFired') {
            // Click Weekly View
            ws.send(JSON.stringify({
              id: 23,
              method: 'Runtime.evaluate',
              params: {
                expression: "document.querySelector('.tab-btn[data-view=\"weekly\"]').click();"
              }
            }));
            
            setTimeout(() => {
              ws.send(JSON.stringify({
                id: 30,
                method: 'Runtime.evaluate',
                params: { expression: "document.getElementById('weeklyReport').innerHTML", returnByValue: true }
              }));
            }, 2000);
          } else if (msg.id === 30) {
            console.log('=== HTML CONTENT ===');
            console.log(msg.result.result.value);
            console.log('====================');
            ws.close();
            edgeProcess.kill();
            process.exit(0);
          }
        };
      } catch (err) {
        edgeProcess.kill();
        process.exit(1);
      }
    });
  });
}, 3000);
