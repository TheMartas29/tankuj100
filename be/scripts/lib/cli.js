const camelCase = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());

function readPositiveInt(argv, name) {
  const at = argv.indexOf(`--${name}`);
  if (at === -1) return null;

  const value = Number(argv[at + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`CHYBA: --${name} čeká kladné celé číslo, např. --${name} 20.`);
    process.exit(1);
  }
  return value;
}

/** Přijímá obojí zápis: `--source orlen` i `--source=orlen`. */
function readText(argv, name) {
  const inline = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3) || null;

  const at = argv.indexOf(`--${name}`);
  if (at === -1) return null;

  const value = argv[at + 1];
  if (!value || value.startsWith('--')) {
    console.error(`CHYBA: --${name} čeká hodnotu, např. --${name} orlen.`);
    process.exit(1);
  }
  return value;
}

function parseArgs({ usage, flags = [], numbers = [], texts = [] }) {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage.trim());
    process.exit(0);
  }

  const parsed = {};
  for (const flag of flags) parsed[camelCase(flag)] = argv.includes(`--${flag}`);
  for (const number of numbers) parsed[camelCase(number)] = readPositiveInt(argv, number);
  for (const text of texts) parsed[camelCase(text)] = readText(argv, text);
  return parsed;
}

module.exports = { parseArgs };
