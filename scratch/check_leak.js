
const fs = require('fs');
const content = fs.readFileSync('c:/projeler/fiyat-bot/scraper.js', 'utf8');
const lines = content.split('\n');

let inFinally = false;
lines.forEach((line, i) => {
    if (line.includes('finally {')) inFinally = true;
    if (inFinally && line.includes('page.close')) {
        console.log(`Found page.close at line ${i+1}`);
        // Check next lines
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
            if (lines[j].includes('page.')) {
                console.log(`POTENTIAL BUG: page used at line ${j+1} after page.close in finally? or after finally?`);
                console.log(`Line ${j+1}: ${lines[j]}`);
            }
        }
    }
    if (line.includes('}')) inFinally = false;
});
