const blank = () => console.log('');

// Popisky delší než `maxLabelWidth` sloupec neroztahují, jen přetečou.
function printSummary(rows, { maxLabelWidth = 34 } = {}) {
  const labels = rows
    .filter(Array.isArray)
    .map(([label]) => label.length)
    .filter((length) => length <= maxLabelWidth);
  const width = labels.length ? Math.max(...labels) + 2 : 0;

  for (const row of rows) {
    if (row == null) blank();
    else if (Array.isArray(row)) console.log(`${`${row[0]}:`.padEnd(width)} ${row[1]}`);
    else console.log(row);
  }
}

function printCounts(title, counts) {
  console.log(title);
  for (const [label, count] of counts) console.log(`  ${label}: ${count}`);
}

const heading = (title) => console.log(`\n${'─'.repeat(26)} ${title} ${'─'.repeat(26)}`);

module.exports = { blank, printSummary, printCounts, heading };
