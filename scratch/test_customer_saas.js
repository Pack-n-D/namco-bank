const http = require('http');

http.get('http://127.0.0.1:3000/customer/profile', (res) => {
  console.log('Status code:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Includes root div:', data.includes('id="root"'));
    const jsMatch = data.match(/index-[a-zA-Z0-9_-]+\.js/);
    console.log('Referenced JS bundle:', jsMatch ? jsMatch[0] : 'None');
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
