#!/usr/bin/env node

// dependencies

const xml2js = require("xml2js");
const xpath = require("xml2js-xpath");
const cmdLineArgs = require('command-line-args');
const chalk = require('chalk');

const fs = require('fs');
const path = require('path');


// Definitions for command line araguments

const definitions = [
  {name: 'input', alias: 'i', type: String, defaultValue: './wordpress.xml'},
  {name: 'output', alias: 'o', type: String, defaultValue: './wordpress'}
];
const args = cmdLineArgs(definitions);


// Initialisation

const parser = new xml2js.Parser({  // https://github.com/Leonidas-from-XIV/node-xml2js#options
  explicitArray: false,
  tagNameProcessors: [ xml2js.processors.stripPrefix ],
});

const HTMLtoMardown = (html) => {
  const turndownService = new require('turndown')({
    headingStyle: 'atx',
    bulletListMarker: '-'
  });

  return turndownService.turndown(html);
}


// And run!

fs.readFile(args.input, (error, data) => {
  if (error) {
    console.error(chalk.red(`Can't access <${args.input}>!`));
    process.exit(1);
  }

  parser.parseString(data, (error, result) => {
    if (error) {
      console.error(chalk.red(error));
      process.exit(1);
    }

    if (!fs.existsSync(args.output)) fs.mkdirSync(args.output, {recursive: true});

    let baseURL = new URL(xpath.evalFirst(result, `//options/siteurl`));
    baseURL = stripTrailingSlash(baseURL.host + baseURL.pathname);
    console.log(chalk.magenta(baseURL));

    xpath.find(result, `//pages/page`).forEach(page => {
      if (validatePage(page)) {
        console.log(chalk.green(`${page.post_title} (ID:${page.ID})`));
        savePage(page);
      } else {
        console.log(chalk.red(`${page.post_title} (ID:${page.ID})`));
      }
    });

    xpath.find(result, `//posts/post`).forEach(post => {
      if (validatePost(post)) {
        console.log(chalk.green(`${post.post_title} (ID:${post.ID})`));
        savePost(post, result);
      } else {
        console.log(chalk.red(`${post.post_title} (ID:${post.ID})`));
      }
    });

    console.log('Done!');

  });

});


const stripTrailingSlash = (str) => {
  return str.replace(/\/$/, '');
}

const stripAccents = (str) => {
  return str.replace(/[é]/g, 'e');
}

const htmlEntities = (str) => {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const cleanCategorySlug = (str) => {
  return str
    .replace(/mynamar-(\w+)/, 'myanmar-$1')
    .replace(/(?:bangkok|cambodge|laos|malaisie|myanmar|thailande)-(?:transports-)*(\w+)/, '$1');
}

const stripBaseAssets = (str) => {
  return str
    .replace(/"https?:\/\/theo-courant.com\/wp-content\/uploads\/(.*?)"/g, '"/uploads/$1"')
    .replace(/"https?:\/\/theo-courant.com\/(.*?)"/g, '"/$1"');
}

const validatePage = (page) => {
  page.post_content = stripBaseAssets(page.post_content);
  return true;
}

const savePage = (page) => {

  let content = `---\n`;
  content += `title: "${htmlEntities(page.post_title)}"\n`;
  content += `date: ${new Date(page.post_date_gmt+'Z').toISOString()}\n`;
  content += `updated: ${new Date(page.post_modified_gmt+'Z').toISOString()}\n`;
  content += `featured: ${stripBaseAssets(page.featured)}\n`;
  content += `---\n`;
  content += `<!--\n${page.post_content}\n-->\n${HTMLtoMardown(page.post_content)}\n`;

  let fullpathname = [args.output, page.language_code, page.path, 'index.md'].join('/');
  if (!fs.existsSync(path.dirname(fullpathname))) fs.mkdirSync(path.dirname(fullpathname), {recursive: true});
  fs.writeFileSync(fullpathname, content);
}


const validatePost = (post) => {
  if (typeof post.category === 'undefined') return;
  if (typeof post.category[0] !== 'undefined') return;

  post.post_content = stripBaseAssets(post.post_content);
  return true;
}

const savePost = (post, result) => {

  let content = `---\n`;
  content += `title: "${htmlEntities(post.post_title)}"\n`;
  content += `date: ${new Date(post.post_date_gmt+'Z').toISOString()}\n`;
  content += `updated: ${new Date(post.post_modified_gmt+'Z').toISOString()}\n`;

  let fullpathname = '';
  let category = post.category;
  if (typeof category !== 'undefined' || typeof category.slug !== 'undefined') {
    category = xpath.evalFirst(result, `//categories/category[slug='${category.slug}']`);
    fullpathname = cleanCategorySlug(category.slug);
    while (category.parent) {
      let category2 = xpath.evalFirst(result, `//categories/category[slug='${category.parent}']`);
      category = {...category2};
      fullpathname = cleanCategorySlug(category.slug) + '/' + fullpathname;
    }
  }

  let tags = xpath.find(post, `//tag/slug`);
  if (tags) content += `tags: [${tags.join(',')}]\n`;

  content += `featured: ${stripBaseAssets(post.featured)}\n`;
  content += `---\n`;
  content += `<!--\n${post.post_content}\n-->\n${HTMLtoMardown(post.post_content)}\n`;

  fullpathname = [args.output, post.language_code, fullpathname , post.post_name+'.md'].join('/');
  if (!fs.existsSync(path.dirname(fullpathname))) fs.mkdirSync(path.dirname(fullpathname), {recursive: true});
  fs.writeFileSync(fullpathname, content);
}
