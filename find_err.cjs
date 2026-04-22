const fs = require('fs');
const acorn = require('acorn');
const code = fs.readFileSync('server/routes/orders.js', 'utf8');

try {
    acorn.parse(code, { ecmaVersion: 2020, sourceType: 'module' });
} catch (e) {
    console.log('Error found at line', e.loc.line, 'col', e.loc.column);
    const lines = code.split('\n');
    console.log(lines.slice(Math.max(0, e.loc.line - 10), e.loc.line + 5).join('\n'));
}
