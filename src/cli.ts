import {cli} from 'gunshi';
import {publishCommand} from './commands/publish.js';

await cli(process.argv.slice(2), publishCommand, {
  name: 'sourcemap-publisher',
  version: '0.0.1',
  description: 'Publishes sourcemaps externally'
});
