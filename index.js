#!/usr/bin/env node

// dependencies

const
  xml2js = require('xml2js'),
  xpath = require('xml2js-xpath'),
  axios = require('axios'),
  limit = require('p-limit')(8),
  // sharp = require('sharp'),
  cmdLineArgs = require('command-line-args'),
  colors = require('ansi-colors');

const
  fs = require('fs'),
  path = require('path');


// Definitions for command line araguments

const definitions = [
  {name: 'input', alias: 'i', type: String, defaultValue: './wordpress.xml'},
  {name: 'output', alias: 'o', type: String, defaultValue: './wordpress'}
];
const args = cmdLineArgs(definitions);


// Initialisation

let baseURL, images;

const parser = new xml2js.Parser({  // https://github.com/Leonidas-from-XIV/node-xml2js#options
  explicitArray: false,
  tagNameProcessors: [ xml2js.processors.stripPrefix ],
});

const turndownService = new require('turndown')({
  headingStyle: 'atx',
  bulletListMarker: '-'
})
  .use(require('joplin-turndown-plugin-gfm').gfm)
  .addRule('images', {
    filter: ['img'],
    replacement: (content, node) => {
      let attr = {
        src: node.getAttribute('src'),
        alt: node.getAttribute('alt') ? node.getAttribute('alt') : path.parse(node.getAttribute('src')).name.replace(/-+\d{1,}x\d{1,}$/, ''),
        width: node.getAttribute('width') ? node.getAttribute('width') : '',
        height: node.getAttribute('height') ? node.getAttribute('height') : '',
      };
      // let dimension = (attr.width || attr.height) ? ` =${attr.width}x${attr.height}` : '';

      return `![${attr.alt}](${attr.src})`;
    }
  });


// All the different functions

// const wait = (ms = 1, value = ms) => new Promise(resolve => setTimeout(() => resolve(value), ms*1000));

const stripTrailingSlash = (str) => str.replace(/\/$/, '');

const htmlEntities = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const stripBase = (str) => {
  return str.replace(new RegExp(`https?://${baseURL}/wp-content/uploads/([^ ]*?)(?:-e\\d{8,})?(?:-\\d{1,4}x\\d{1,4})?.(jpg|jpeg|mp4|png|gif)`, 'g'), (match, filename, ext) => {
    // getImage(`https://${baseURL}/wp-content/uploads/${filename}.${ext}`, `${args.output}/images/${filename}.${ext}`);
    images.push(`${filename}.${ext}`);
    return `/images/${filename}.${ext}`;
  })
    .replace(new RegExp(`https?://${baseURL}/(.*?)`, 'g'), '/$1');
};

const logger = (filename, str) => {
  const dirname = path.join(args.output, path.dirname(filename));
  if (!fs.existsSync(dirname)) fs.mkdirSync(dirname, {recursive: true});

  fs.appendFileSync(`${args.output}/${filename}.log`, `${str}\n`);
};

const HTMLtoMardown = (html, ID) => {

  // Fix <p>. Really hate wordpress!
  if (!/<p>/i.test(html)) {
    html = '<p>' + html.replace(/(\r?\n){2}/g, '</p>\n\n<p>') + '</p>';
  }

  // MetaSlider
  // [metaslider id="45409"]
  if (/\[metaslider .*]/.test(html)) logger('metaslider', ID);

  // Mappress
  // [mappress mapid="179"]
  // <p style="text-align: justify;">[mappress mapid="4"]</p>
  if (/\[mappress .*]/.test(html)) logger('mappress', ID);

  // Tablepress
  // <p style="text-align: justify;">[table id=12 /]</p>
  // [table id=93 responsive = flip responsive_breakpoint = flip /]
  if (/\[table .*]/.test(html)) logger('tablepress', ID);

  // [video width="1280" height="720" mp4="http://theo-courant.com/wp-content/uploads/2014/10/Bangkok-et-ses-deux-aéroports.mp4" loop="true" autoplay="true" preload="auto"][/video]
  if (/\[video .*]/.test(html)) logger('video', ID);

  // <code class="wp">[timetable agent="346579" from="Bangkok" to="Narathiwat" class="train" curr="THA"]</code>

  // [bdotcom_bm bannerid="50157"]

  // columns & column
  html = html
    .replace(/\[columns]/g, '{% columns %}')
    .replace(/\[\/columns]/g, '{% endcolumns %}')
    .replace(/\[column]/g, '{% column %}')
    .replace(/\[\/column]/g, '{% endcolumn %}');

  // Youtube
  // [embed]https://youtu.be/x0PhfNNZN4c[/embed]
  // [embed]https://www.youtube.com/watch?v=gebWPrCIF7s[/embed]
  html = html.replace(/\[embed](.*youtu(be\.com|\.be).*)\[\/embed]/g, '{% inline "youtube", ID="$1" %}');

  // Embedded and unknown so far
  //html = html.replace(/\[embed](.*)\[\/embed]/g, '{% inline $1 %}').replace(/\[(.*)]/g, '{% inline $1 %}');

  return turndownService.turndown(html);
};

const validatePage = (page) => {
  page.post_content = stripBase(page.post_content);
  if (page.featured) page.featured = '/images/' + page.featured;
  return true;
};

const savePage = async (page) => {
  let content = `---\n`;
  content += `title: "${htmlEntities(page.post_title)}"\n`;
  content += `description: "${htmlEntities(page.description)}"\n`;
  content += `date: ${new Date(page.post_date_gmt+'Z').toISOString()}\n`;
  content += `updated: ${new Date(page.post_modified_gmt+'Z').toISOString()}\n`;
  // if (page.featured) content += `featured: ${page.featured}\n`;
  content += `draft: true\n`;
  content += `wpID: ${page.ID}\n`;
  content += `---\n`;
  content += HTMLtoMardown(String(page.post_content), page.ID);

  let fullpathname;
  if (~[3504, 19674, 46895].indexOf(Number(page.ID))) {
    // Homepage & outside pages
    fullpathname = [args.output, page.language_code, page.post_name+'.md'].join('/');
  } else {
    fullpathname = [args.output, page.language_code, page.path, '_index.md'].join('/');
  }
  if (!fs.existsSync(path.dirname(fullpathname))) fs.mkdirSync(path.dirname(fullpathname), {recursive: true});
  fs.writeFileSync(fullpathname, content);
};

const validatePost = (post) => {
  if (typeof post.category === 'undefined') return;
  if (typeof post.category[0] !== 'undefined') return;

  post.post_content = stripBase(post.post_content);
  if (post.featured) post.featured = stripBase(`https://${baseURL}/wp-content/uploads/${post.featured}`);
  return true;
};

const cleanCategorySlug = (str) => {
  return str
    .replace(/mynamar-(\w+)/, 'myanmar-$1')
    .replace(/(?:bangkok|cambodge|laos|malaisie|myanmar|thailande)-(?:transports-)*(\w+)/, '$1');
};

const savePost = (post, result) => {
  let content = `---\n`;
  content += `title: "${htmlEntities(post.post_title)}"\n`;
  content += `description: "${htmlEntities(post.description)}"\n`;
  content += `date: ${new Date(post.post_date_gmt+'Z').toISOString()}\n`;
  content += `updated: ${new Date(post.post_modified_gmt+'Z').toISOString()}\n`;

  let fullpathname = '';
  let category = post.category;
  let tags = [];
  let tmp;
  if (typeof category !== 'undefined' || typeof category.slug !== 'undefined') {
    category = xpath.evalFirst(result, `//categories/category[slug='${category.slug}']`);
    tmp = cleanCategorySlug(category.slug);
    fullpathname = tmp;
    while (category.parent) {
      let category2 = xpath.evalFirst(result, `//categories/category[slug='${category.parent}']`);
      category = {...category2};
      tmp = cleanCategorySlug(category.slug);
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
  content += HTMLtoMardown(String(post.post_content), post.ID);

  fullpathname = [args.output, post.language_code, fullpathname , post.post_name+'.md'].join('/');
  if (!fs.existsSync(path.dirname(fullpathname))) fs.mkdirSync(path.dirname(fullpathname), {recursive: true});
  fs.writeFileSync(fullpathname, content);
};

const getImage = (url, filename) => {
  return new Promise(resolve => {
    if (!fs.existsSync(filename)) {

      axios.get(encodeURI(url), {responseType: 'arraybuffer'})
        .then(response => {
          console.log(colors.yellow(url));
          fs.mkdirSync(path.dirname(filename), {recursive: true});
          // switch (path.extname(filename).toLowerCase()) {
          //   case '.jpg':
          //   case '.jpeg':
          //     sharp(response.data).resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true})
          //       // .jpeg({quality: 60, chromaSubsampling: '4:2:0'})
          //       .toFile(filename)
          //       .then(() => resolve())
          //       .catch(error => {
          //         console.log(colors.red(error));
          //         return reject();
          //       });
          //     break;
          //   case '.png':
          //     sharp(response.data).resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true})
          //       // .png({quality: 80})
          //       .toFile(filename)
          //       .then(() => resolve())
          //       .catch(error => {
          //         console.log(colors.red(error));
          //         return reject();
          //       });
          //     break;
          //   default:
          //     fs.writeFileSync(filename, response.data);
          //     resolve();
          // }
          fs.writeFileSync(filename, response.data);
          resolve();
        })
        .catch(error => {
          console.log(colors.red(`${error.response.status}: ${url}`));
          logger('images', `${error.response.status}: ${url} (${filename})`);
          resolve();
        });

    } else resolve();
  });
};


// And now, let's go!

(async () => {

  const hrstart = process.hrtime();
  console.info(colors.magentaBright(`--- Starting ---`));

  let result;
  try {
    result = await parser.parseStringPromise(fs.readFileSync(args.input));
  } catch (e) {
    console.error(colors.red(e.message));
    process.exit();
  }

  if (!fs.existsSync(args.output)) fs.mkdirSync(args.output, {recursive: true});

  // Base URL
  baseURL = new URL(xpath.evalFirst(result, `//options/siteurl`));
  baseURL = stripTrailingSlash(baseURL.host + baseURL.pathname);
  console.info(colors.cyan(baseURL));

  // Every page
  for (const page of xpath.find(result, `//pages/page`)) {
    images = [];
    if (validatePage(page)) {
      console.log(colors.green('%s (ID:%d)'), page.post_title, page.ID);
      savePage(page);
      // await Promise.all([1, 2].map(time => limit(() => wait(time).then(console.log))))
      await Promise.all(images.map(image => limit(() => getImage(`https://${baseURL}/wp-content/uploads/${image}`, `${args.output}/images/${image}`))));
    } else {
      console.log(colors.red('%s (ID:%d)'), page.post_title, page.ID);
    }
  }

  // Every post
  for (const post of xpath.find(result, `//posts/post`)) {
    if (validatePost(post)) {
      console.log(colors.green('%s (ID:%d)'), post.post_title, post.ID);
      savePost(post, result);
    } else {
      console.log(colors.red('%s (ID:%d)'), post.post_title, post.ID);
    }
  }

  const hrend = process.hrtime(hrstart);
  console.info(colors.magentaBright(`--- Done --- : ${hrend[0]}s ${hrend[1] / 1000000}ms`));
  colors.reset();
})();
