<?php
header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');

$version = array(
    'version' => '2.0.' . time(),
    'build_date' => date('Y-m-d H:i:s'),
    'timestamp' => time(),
    'files' => array(
        'index.html' => filemtime('index.html'),
        'script.js' => filemtime('script.js'),
        'style.css' => filemtime('style.css')
    )
);

echo json_encode($version, JSON_PRETTY_PRINT);
?>