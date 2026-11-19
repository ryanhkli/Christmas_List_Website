/**
 * Purchase tracker for Ryan's Christmas List.
 * Deploy as a web app: Execute as "Me", Who has access "Anyone".
 * It creates a Google Sheet called "Ryan's Christmas List purchases" in your Drive on first use.
 */
const SHEET_NAME = 'Purchases';

function sheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  let ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create("Ryan's Christmas List purchases");
    props.setProperty('SHEET_ID', ss.getId());
  }
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['id', 'purchased', 'updated']);
  }
  return sh;
}

function readAll_(sh) {
  const out = {};
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] && rows[i][1] === true) out[String(rows[i][0])] = true;
  }
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  try {
    return json_({ ok: true, purchased: readAll_(sheet_()) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse(e.postData.contents);
    const id = String(body.id || '');
    if (!/^[a-z0-9-]{1,40}$/.test(id)) return json_({ ok: false, error: 'bad id' });
    const want = body.purchased === true;
    const sh = sheet_();
    const rows = sh.getDataRange().getValues();
    let row = -1;
    for (let i = 1; i < rows.length; i++) if (String(rows[i][0]) === id) { row = i + 1; break; }
    if (row === -1) {
      if (rows.length > 500) return json_({ ok: false, error: 'full' });
      sh.appendRow([id, want, new Date()]);
    } else {
      sh.getRange(row, 2, 1, 2).setValues([[want, new Date()]]);
    }
    return json_({ ok: true, purchased: readAll_(sh) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}
