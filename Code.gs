function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('レポート工房')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}