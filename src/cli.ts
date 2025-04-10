import {fdir} from 'fdir';
import {cli, Command} from 'gunshi';
import path from 'node:path';

const command: Command = {
  name: 'sourcemap-publisher',
  description: 'Publishes sourcemaps externally',
  options: {},
  async run(ctx) {
    const cwd = process.cwd();
    const paths = (
      ctx.positionals.length > 0 ? ctx.positionals : ['dist/']
    ).map((p) => path.join(cwd, p));
    const crawler = new fdir();
    const files = await crawler
      .withFullPaths()
      .exclude((_dirName, dirPath) => {
        return !paths.some((p) => dirPath.startsWith(p));
      })
      .filter((file) => {
        return (
          paths.some((p) => file.startsWith(p)) &&
          (file.endsWith('.js') || file.endsWith('.ts'))
        );
      })
      .crawl()
      .withPromise();
    console.log(files);
  }
};

await cli(process.argv.slice(2), command);
