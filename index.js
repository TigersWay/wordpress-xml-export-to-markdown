#!/usr/bin/env node

// dependencies

const xml2js = require("xml2js");
const xpath = require("xml2js-xpath");
// const accents = require('remove-accents');
const cmdLineArgs = require('command-line-args');
const colors = require('ansi-colors');

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

  turndownService.use(require('joplin-turndown-plugin-gfm').gfm)

  turndownService.addRule('images', {
    filter: ['img'],
    replacement: (content, node, options) => {
      let attr = {
        src: node.getAttribute('src'),
        alt: node.getAttribute('alt') ? node.getAttribute('alt') : path.parse(node.getAttribute('src')).name.replace(/-+\d{1,}x\d{1,}$/, ''),
        width: node.getAttribute('width') ? node.getAttribute('width') : '',
        height: node.getAttribute('height') ? node.getAttribute('height') : '',
      }
      let dimension = (attr.width || attr.height) ? ` =${attr.width}x${attr.height}` : ''

      return `![${attr.alt}](${attr.src})`;
    }
  });

  // Fix <p>
  if (!/<p>/i.test(html)) {
    html = '<p>' + html.replace(/(\r?\n){2}/g, '</p>\n\n<p>') + '</p>';
  }

  return turndownService.turndown(html);
}


// And run!

let baseURL;

fs.readFile(args.input, (error, data) => {
  if (error) {
    console.error(colors.red(`Can't access <${args.input}>!`));
    process.exit(1);
  }

  parser.parseString(data, (error, result) => {
    if (error) {
      console.error(colors.red(error));
      process.exit(1);
    }

    if (!fs.existsSync(args.output)) fs.mkdirSync(args.output, {recursive: true});

    baseURL = new URL(xpath.evalFirst(result, `//options/siteurl`));
    baseURL = stripTrailingSlash(baseURL.host + baseURL.pathname);
    console.log(colors.magenta(baseURL));

    xpath.find(result, `//pages/page`).forEach(page => {
      if (validatePage(page)) {
        console.log(colors.green(`${page.post_title} (ID:${page.ID})`));
        savePage(page);
      } else {
        console.log(colors.red(`${page.post_title} (ID:${page.ID})`));
      }
    });

    xpath.find(result, `//posts/post`).forEach(post => {
      if (validatePost(post)) {
        console.log(colors.green(`${post.post_title} (ID:${post.ID})`));
        savePost(post, result);
      } else {
        console.log(colors.red(`${post.post_title} (ID:${post.ID})`));
      }
    });

    console.log('Done!');

  });

});


const stripTrailingSlash = (str) => {
  return str.replace(/\/$/, '');
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

// const replaceAttachment = (match, p1, p2, offset, string) => {
//   let cleaned = accents.remove(decodeURI(p1)).toLowerCase();
//   fs.appendFileSync(path.join(args.output, 'attachment.txt'), `curl -sk -A Export --create-dirs -o "${cleaned}.${p2}" "https://${baseURL}/wp-content/uploads/${p1}.${p2}"\n`);
//   return `/static/images/${cleaned}.${p2}`;
// }

const stripBase = (str) => {
  return str
    // .replace(new RegExp(`https?:\/\/${baseURL}\/wp-content\/uploads\/(.*?).(jpg|jpeg|mp4|png|gif)`, 'g'), replaceAttachment)
    .replace(new RegExp(`https?:\/\/${baseURL}\/wp-content\/uploads\/(.*?).(jpg|jpeg|mp4|png|gif)`, 'g'), '/images/$1.$2')
    .replace(new RegExp(`https?:\/\/${baseURL}\/(.*?)`, 'g'), '/$1');
}

const validatePage = (page) => {
  page.post_content = stripBase(page.post_content);
  // page.featured = stripBase(page.featured);
  if (page.featured) page.featured = '/images/' + page.featured;
  return true;
}

const savePage = (page) => {

  let content = `---\n`;
  content += `title: "${htmlEntities(page.post_title)}"\n`;
  content += `description: ""\n`;
  content += `date: ${new Date(page.post_date_gmt+'Z').toISOString()}\n`;
  content += `updated: ${new Date(page.post_modified_gmt+'Z').toISOString()}\n`;
  // if (page.featured) content += `featured: ${page.featured}\n`;
  content += `draft: true\n`;
  content += `wpID: ${page.ID}\n`;
  content += `---\n`;
  // content += `<!--\n${page.post_content}\n-->\n${HTMLtoMardown(page.post_content)}\n`;
  content += HTMLtoMardown(page.post_content);

  let fullpathname;
  if (~[3504, 19674, 46895].indexOf(Number(page.ID))) {
    fullpathname = [args.output, page.language_code, page.post_name+'.md'].join('/');
  } else {
    fullpathname = [args.output, page.language_code, page.path, '_index.md'].join('/');
  }
  if (!fs.existsSync(path.dirname(fullpathname))) fs.mkdirSync(path.dirname(fullpathname), {recursive: true});
  fs.writeFileSync(fullpathname, content);
}


const validatePost = (post) => {
  if (typeof post.category === 'undefined') return;
  if (typeof post.category[0] !== 'undefined') return;

  post.post_content = stripBase(post.post_content);
  if (post.featured) post.featured = '/images/' + post.featured;
  return true;
}

const savePost = (post, result) => {

  let content = `---\n`;
  content += `title: "${htmlEntities(post.post_title)}"\n`;
  content += `description: ""\n`;
  content += `date: ${new Date(post.post_date_gmt+'Z').toISOString()}\n`;
  content += `updated: ${new Date(post.post_modified_gmt+'Z').toISOString()}\n`;

  let fullpathname = '';
  let category = post.category;
  let tags = [];
  let tmp;
  if (typeof category !== 'undefined' || typeof category.slug !== 'undefined') {
    category = xpath.evalFirst(result, `//categories/category[slug='${category.slug}']`);
    tmp = cleanCategorySlug(category.slug);
    // tags.push(tmp);
    fullpathname = tmp;
    while (category.parent) {
      let category2 = xpath.evalFirst(result, `//categories/category[slug='${category.parent}']`);
      category = {...category2};
      tmp = cleanCategorySlug(category.slug);
      // tags.push(tmp);
      fullpathname = tmp + '/' + fullpathname;
    }
  }
  tags.reverse();

  tags = tags.concat(xpath.find(post, `//tag/slug`).filter(tag => tags.indexOf(tag) < 0));
  if (tags) content += `tags: [${tags.join(',')}]\n`;

  if (post.featured) content += `featured: ${post.featured}\n`;
  content += `draft: true\n`;
  content += `wpID: ${post.ID}\n`;
  content += `---\n`;
  // content += `<!--\n${post.post_content}\n-->\n${HTMLtoMardown(post.post_content)}\n`;
  content += HTMLtoMardown(post.post_content);

  fullpathname = [args.output, post.language_code, fullpathname , post.post_name+'.md'].join('/');
  if (!fs.existsSync(path.dirname(fullpathname))) fs.mkdirSync(path.dirname(fullpathname), {recursive: true});
  fs.writeFileSync(fullpathname, content);
}
