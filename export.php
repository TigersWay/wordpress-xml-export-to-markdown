<?php
/**
 * Generic export bricks from wordpress
 * v0.3.1
 * Ben Michaud <ben@tigersway.net>
 *
 * Features:
 * - Some options
 * - authors
 * - Categories
 * - Pages
 * - Posts
 * - WPML: Posts/Pages language code
 * - Images / Attachments / Featured
 */
?><!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="x-ua-compatible" content="ie=edge">
  <title>Export wordpress (v0.3.0)</title>

  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
  body {padding: 0 2em;}
  h3, div, p {margin: 0; padding: .2em;}
  div {padding-left:.5em;}
  </style>

</head>
<body><?php

define('SHORTINIT', true);
require('./wp-load.php');

global $wpdb;

// theo-courant
$wpdb->select('4443919-1');


class XMLExport {

  private $xmlWriter;
  private $outputFilename;

  protected function flush($forced = false) {
    if ($forced OR $this->loop++ > 20)
      file_put_contents($this->outputFilename, $this->xmlWriter->flush(true), FILE_APPEND);
  }

  function __construct($filename = './export.xml') {
    $this->xmlWriter = new XMLWriter();
    $this->xmlWriter->openMemory();
    $this->xmlWriter->setIndent(true);
    $this->xmlWriter->startDocument('1.0', 'UTF-8');
    //
    $this->outputFilename = $filename;
    file_put_contents($this->outputFilename, $this->xmlWriter->flush(true));
  }

  function __destruct() {
    $this->xmlWriter->endDocument();
    $this->flush();
  }

  function startElement($name) {
    $this->xmlWriter->startElement($name);
  }

  function endElement($forced = false) {
    $this->xmlWriter->endElement();
    $this->flush($forced);
  }

  function element($name, $content) {
    $this->xmlWriter->writeElement($name, $content);
  }

  function elements(&$record, $htmlFields = []) {
    foreach($record as $key => $value) {
      if (in_array($key, $htmlFields)) {
        $this->xmlWriter->startElement($key);
        $this->xmlWriter->writeCData($value);
        $this->xmlWriter->endElement();
      } else {
        $this->xmlWriter->writeElement($key, $value);
      }
    }
  }
}



$xml = new XMLExport();
$xml->startElement('wordpress');



$xml->startElement('options');
$items = $wpdb->get_results(<<<EOT
SELECT option_name, option_value
  FROM {$wpdb->prefix}options
  WHERE option_name IN ('siteurl', 'home', 'blogname', 'blogdescription', 'timezone_string')
EOT);
foreach($items as $item) {
  $xml->element($item->option_name, $item->option_value);
}
unset($items);
$xml->endElement();


function expandGalleries(&$html) {
  $html = preg_replace_callback(
    '~\[gallery .*ids="(.*?)".*]~',
    function ($keys) {
      global $wpdb;
      $gallery = '';
      foreach (explode(',', $keys[1]) as $key) {
        if ($image = $wpdb->get_row("SELECT post_title 'alt', guid 'url' FROM {$wpdb->prefix}posts WHERE ID=$key")) {
          $gallery .= "<img class=\"gallery\" src=\"$image->url\" alt=\"$image->alt\">";
        } else { // it doesn't seem to happen
          $gallery .= "<img class=\"gallery\" data-src=\"$key\" alt=\"...\">";
        }
      }
      return $gallery;
    },
    $html);
}


echo '<h3>Authors</h3><div>'; // -----------------------------------------------

$xml->startElement('authors');
$items = $wpdb->get_results(<<<EOT
SELECT *
FROM {$wpdb->prefix}users
WHERE ID IN (SELECT DISTINCT post_author
  FROM {$wpdb->prefix}posts
  WHERE post_type IN ('page', 'post') AND post_status='publish')
EOT);
foreach($items as $item) {
  echo $item->display_name . '<br>';
  $xml->startElement('author'); $xml->elements($item); $xml->endElement();
}
echo "</div><p><i>" . sizeof($items) . " authors</i></p>\n";
unset($items);
$xml->endElement();


echo '<h3>Pages</h3><div>'; // -------------------------------------------------

$xml->startElement('pages');
$items = $wpdb->get_results(<<<EOT
SELECT
  P.*,
  language_code,
  (SELECT DISTINCT M2.meta_value
    FROM {$wpdb->prefix}postmeta M1
      LEFT JOIN {$wpdb->prefix}postmeta M2 ON M1.meta_value=M2.post_id
    WHERE M1.post_id=P.ID AND M1.meta_key='_thumbnail_id' AND M2.meta_key='_wp_attached_file') 'featured',
  CONCAT_WS('/', P4.post_name, P3.post_name, P2.post_name, P.post_name) 'path',
  M3.meta_value 'description'
FROM {$wpdb->prefix}posts P
  LEFT JOIN {$wpdb->prefix}icl_translations T ON P.ID=element_id
  LEFT JOIN {$wpdb->prefix}postmeta M3 ON P.ID=M3.post_id
  LEFT JOIN {$wpdb->prefix}posts P2 ON P.post_parent=P2.ID
    LEFT JOIN {$wpdb->prefix}posts P3 ON P2.post_parent=P3.ID
      LEFT JOIN {$wpdb->prefix}posts P4 ON P3.post_parent=P4.ID
WHERE P.post_type='page' AND P.post_status='publish' AND element_type='post_page' AND M3.meta_key='gavern-post-desc'
EOT);
foreach($items as $item) {
  unset($item->post_content_filtered);
  echo $item->post_title . '<br>';
  $xml->startElement('page');
  expandGalleries($item->post_content);
  $xml->elements($item, ['post_title', 'post_content']);
  $xml->endElement();
}
echo "</div><p><i>" . sizeof($items) . " pages</i></p>\n";
unset($items);
$xml->endElement();


echo '<h3>Categories</h3><div>'; // --------------------------------------------

$xml->startElement('categories');
$items = $wpdb->get_results(<<<EOT
SELECT
  T1.name,
  T1.slug,
  T2.slug 'parent'
FROM {$wpdb->prefix}terms T1
  JOIN {$wpdb->prefix}term_taxonomy TT ON T1.term_id=TT.term_id
    LEFT JOIN {$wpdb->prefix}terms T2 ON TT.parent=T2.term_id
WHERE taxonomy='category'
--  AND TT.term_taxonomy_id IN (SELECT DISTINCT term_taxonomy_id
--    FROM {$wpdb->prefix}term_relationships
--      JOIN {$wpdb->prefix}posts ON object_id=ID
--    WHERE post_type IN ('page','post') AND post_status='publish')
EOT);
foreach($items as $item) {
  echo $item->name . '<br>';
  $xml->startElement('category'); $xml->elements($item); $xml->endElement();
}
echo "</div><p><i>" . sizeof($items) . " categories</i></p>\n";
unset($items);
$xml->endElement();


echo '<h3>Posts</h3><div>'; // -------------------------------------------------

function terms($ID) {
  global $wpdb, $xml;
  $terms = $wpdb->get_results(<<<EOT
SELECT
  name,
  slug,
  SUBSTRING_INDEX(taxonomy, '_', -1) 'taxonomy'
FROM {$wpdb->prefix}term_relationships TR
  JOIN {$wpdb->prefix}term_taxonomy TT ON TR.term_taxonomy_id=TT.term_taxonomy_id
  JOIN {$wpdb->prefix}terms T ON TT.term_id=T.term_id
WHERE object_id=$ID AND taxonomy IN ('category', 'post_tag')
EOT);
  foreach($terms as $term) {
    $xml->startElement($term->taxonomy);
    unset($term->taxonomy);
    $xml->elements($term);
    $xml->endElement();
  }
}

$xml->startElement('posts');
$items = $wpdb->get_results(<<<EOT
SELECT
  P.*,
  language_code,
  (SELECT DISTINCT M2.meta_value
    FROM {$wpdb->prefix}postmeta M1
      LEFT JOIN {$wpdb->prefix}postmeta M2 ON M1.meta_value=M2.post_id
    WHERE M1.post_id=P.ID AND M1.meta_key='_thumbnail_id' AND M2.meta_key='_wp_attached_file') 'featured',
  M3.meta_value 'description'
FROM {$wpdb->prefix}posts P
  LEFT JOIN {$wpdb->prefix}icl_translations T ON ID=element_id
  LEFT JOIN {$wpdb->prefix}postmeta M3 ON P.ID=M3.post_id
WHERE post_type='post' AND post_status='publish' AND element_type='post_post' AND M3.meta_key='gavern-post-desc'
EOT);
foreach($items as $item) {
  unset($item->post_content_filtered);
  echo $item->post_title . '<br>';
  $xml->startElement('post');
  expandGalleries($item->post_content);
  $xml->elements($item, ['post_title', 'post_content']);
  terms($item->ID);
  $xml->endElement();
}
echo "</div><p><i>" . sizeof($items) . " posts</i></p>\n";
unset($items);
$xml->endElement();

$xml->endElement(true);


echo '<h3>Done!</h3>';
