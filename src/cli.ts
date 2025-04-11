import {cli, define} from 'gunshi';
import {publishCommand} from './commands/publish.js';

const subCommands = new Map([['publish', publishCommand]]);

const mainCommand = define({
  name: 'default',
  run() {
    console.log('No command specified. See --help for available commands.');
  }
});

await cli(process.argv.slice(2), mainCommand, {
  name: 'sourcemap-publisher',
  version: '0.0.1',
  description: 'Publishes sourcemaps externally',
  subCommands
});
