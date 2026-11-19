# Ryan's Christmas List

A one-page wish list. `index.html` is the page, `img/` holds the photos, and `config.js` holds the
address of the purchase tracker.

## Turning on "Mark as purchased"

1. On a computer, open https://script.new while signed in to Google.
2. Replace the sample code with the contents of `backend/Code.gs` and save.
3. Deploy > New deployment > Web app. Set "Execute as" to Me and "Who has access" to Anyone, then Deploy and approve the permission prompt.
4. Copy the web app URL and paste it between the quotes in `config.js`.
