"""Wikipedia-style CSS for CK3 Save Browser."""

WIKI_CSS = """
/* ===== Wikipedia-Inspired Stylesheet for CK3 Browser ===== */

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: 'Linux Libertine', 'Georgia', 'Times', serif;
    font-size: 14px;
    line-height: 1.6;
    color: #202122;
    background: #f6f6f6;
}

/* Top Banner */
.site-header {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    color: #e0d5b7;
    padding: 12px 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 3px solid #c9a84c;
    position: sticky;
    top: 0;
    z-index: 100;
}

.site-header h1 {
    font-family: 'Linux Libertine', Georgia, serif;
    font-size: 20px;
    font-weight: normal;
    letter-spacing: 1px;
}

.site-header h1 a {
    color: #e0d5b7;
    text-decoration: none;
}

.site-header h1 a:hover { color: #fff; }

.header-nav {
    display: flex;
    gap: 16px;
    font-family: sans-serif;
    font-size: 13px;
}

.header-nav a {
    color: #c9a84c;
    text-decoration: none;
    padding: 4px 8px;
    border-radius: 3px;
    transition: background 0.2s;
}

.header-nav a:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
}

/* Search bar in header */
.header-search {
    display: flex;
    gap: 4px;
}

.header-search input {
    padding: 5px 10px;
    border: 1px solid #555;
    border-radius: 3px;
    font-size: 13px;
    width: 220px;
    background: rgba(255,255,255,0.1);
    color: #e0d5b7;
}

.header-search input::placeholder { color: #999; }

.header-search button {
    padding: 5px 12px;
    background: #c9a84c;
    border: none;
    border-radius: 3px;
    color: #1a1a2e;
    font-weight: bold;
    cursor: pointer;
    font-size: 13px;
}

.header-search button:hover { background: #dabb5e; }

/* Page Content Area */
.content-wrapper {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0;
    background: #ffffff;
    border-left: 1px solid #a7d7f9;
    border-right: 1px solid #a7d7f9;
    min-height: calc(100vh - 52px);
}

.page-content {
    padding: 20px 30px 40px;
}

/* Page Title */
.page-title {
    font-family: 'Linux Libertine', Georgia, serif;
    font-size: 28px;
    font-weight: normal;
    border-bottom: 1px solid #a2a9b1;
    padding-bottom: 6px;
    margin-bottom: 16px;
    color: #000;
}

/* Wikipedia-style links */
a { color: #0645ad; text-decoration: none; }
a:hover { text-decoration: underline; }
a:visited { color: #0b0080; }
a.redlink { color: #d33; }

/* Section Headers */
h2 {
    font-family: 'Linux Libertine', Georgia, serif;
    font-size: 22px;
    font-weight: normal;
    border-bottom: 1px solid #a2a9b1;
    padding-bottom: 4px;
    margin: 24px 0 12px;
}

h3 {
    font-family: 'Linux Libertine', Georgia, serif;
    font-size: 17px;
    font-weight: bold;
    margin: 20px 0 8px;
}

h4 {
    font-size: 14px;
    font-weight: bold;
    margin: 16px 0 6px;
}

p { margin: 8px 0; }

/* Infobox (right sidebar on character/war/realm pages) */
.infobox {
    float: right;
    clear: right;
    margin: 0 0 16px 20px;
    width: 300px;
    border: 1px solid #a2a9b1;
    border-collapse: collapse;
    font-size: 13px;
    background: #f8f9fa;
    line-height: 1.5;
}

.infobox-title {
    background: linear-gradient(135deg, #1a1a2e, #0f3460);
    color: #e0d5b7;
    text-align: center;
    padding: 10px 8px;
    font-size: 16px;
    font-family: 'Linux Libertine', Georgia, serif;
    font-weight: bold;
    letter-spacing: 0.5px;
}

.infobox-subtitle {
    background: #2a2a4e;
    color: #c9a84c;
    text-align: center;
    padding: 4px 8px;
    font-size: 12px;
    font-style: italic;
}

.infobox-image {
    text-align: center;
    padding: 10px;
    background: #eee;
    font-size: 60px;
}

.infobox-section {
    background: #d4c5a0;
    color: #333;
    text-align: center;
    padding: 4px 8px;
    font-weight: bold;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
}

.infobox-row {
    display: flex;
    border-top: 1px solid #ddd;
}

.infobox-label {
    background: #eaecf0;
    padding: 6px 10px;
    font-weight: bold;
    width: 100px;
    flex-shrink: 0;
    font-size: 12px;
    color: #555;
}

.infobox-value {
    padding: 6px 10px;
    flex: 1;
}

/* Trait pills */
.trait-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 10px;
}

.trait-pill {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-family: sans-serif;
}

.trait-personality { background: #dfe8f0; color: #2c5282; }
.trait-education { background: #e8f5e9; color: #2e7d32; }
.trait-congenital { background: #fce4ec; color: #c62828; }
.trait-commander { background: #fff3e0; color: #e65100; }
.trait-health { background: #f3e5f5; color: #6a1b9a; }
.trait-lifestyle { background: #e0f2f1; color: #00695c; }
.trait-criminal { background: #fbe9e7; color: #bf360c; }
.trait-other { background: #eceff1; color: #455a64; }

/* Skills bar */
.skills-table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    font-family: sans-serif;
    font-size: 12px;
}

.skills-table th {
    padding: 4px 6px;
    font-size: 11px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: normal;
    border-bottom: 2px solid #ddd;
}

.skills-table td {
    padding: 6px;
    text-align: center;
    font-weight: bold;
    font-size: 16px;
}

.skill-low { color: #c62828; }
.skill-avg { color: #666; }
.skill-good { color: #2e7d32; }
.skill-great { color: #1565c0; }
.skill-legendary { color: #6a1b9a; }

/* Tables */
table.wikitable {
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 13px;
    background: #f8f9fa;
    border: 1px solid #a2a9b1;
}

table.wikitable th {
    background: #eaecf0;
    padding: 8px 12px;
    text-align: left;
    border: 1px solid #a2a9b1;
    font-weight: bold;
}

table.wikitable td {
    padding: 6px 12px;
    border: 1px solid #a2a9b1;
}

table.wikitable tr:nth-child(even) { background: #f0f0f0; }

/* War belligerents table */
.belligerents-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    border: 2px solid #888;
}

.belligerents-table th {
    padding: 10px;
    font-size: 15px;
    text-align: center;
    border: 1px solid #888;
}

.belligerents-header-attacker { background: #fee; color: #900; }
.belligerents-header-defender { background: #eef; color: #009; }

.belligerents-table td {
    padding: 8px 12px;
    vertical-align: top;
    width: 50%;
    border: 1px solid #ccc;
}

.belligerents-attacker { background: #fff5f5; }
.belligerents-defender { background: #f5f5ff; }

/* Table of Contents */
.toc {
    background: #f8f9fa;
    border: 1px solid #a2a9b1;
    padding: 12px 20px;
    display: inline-block;
    margin: 12px 0;
    font-size: 13px;
    max-width: 350px;
}

.toc-title {
    font-weight: bold;
    text-align: center;
    margin-bottom: 8px;
}

.toc ol {
    margin: 0;
    padding-left: 24px;
}

.toc li { margin: 3px 0; }
.toc a { color: #0645ad; }

/* Hatnote (disambiguation-style note at top) */
.hatnote {
    font-style: italic;
    color: #555;
    padding-left: 20px;
    margin: 8px 0 16px;
    font-size: 13px;
}

/* Portal page */
.portal-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin: 16px 0;
}

.portal-box {
    background: #f8f9fa;
    border: 1px solid #c8ccd1;
    border-radius: 4px;
    padding: 16px;
}

.portal-box h3 {
    margin: 0 0 10px;
    padding-bottom: 6px;
    border-bottom: 2px solid #c9a84c;
    font-family: 'Linux Libertine', Georgia, serif;
    color: #1a1a2e;
}

.portal-box ul {
    list-style: none;
    padding: 0;
}

.portal-box li {
    padding: 4px 0;
    border-bottom: 1px solid #eee;
}

.portal-box li:last-child { border-bottom: none; }

.portal-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin: 16px 0;
}

.stat-card {
    background: linear-gradient(135deg, #1a1a2e, #0f3460);
    color: #e0d5b7;
    padding: 16px;
    border-radius: 6px;
    text-align: center;
}

.stat-number {
    font-size: 32px;
    font-weight: bold;
    color: #c9a84c;
    display: block;
}

.stat-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-top: 4px;
    opacity: 0.8;
}

/* Character list */
.char-list-item {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #eee;
    transition: background 0.2s;
}

.char-list-item:hover { background: #f0f4ff; }

.char-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #eaecf0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 12px;
    font-size: 16px;
    flex-shrink: 0;
}

.char-info { flex: 1; }
.char-name { font-weight: bold; }
.char-detail { font-size: 12px; color: #666; }

/* Landing Page */
.landing-container {
    max-width: 800px;
    margin: 60px auto;
    padding: 0 20px;
    text-align: center;
}

.landing-logo {
    font-size: 64px;
    margin-bottom: 16px;
}

.landing-title {
    font-family: 'Linux Libertine', Georgia, serif;
    font-size: 42px;
    color: #1a1a2e;
    margin-bottom: 8px;
}

.landing-subtitle {
    font-size: 16px;
    color: #666;
    margin-bottom: 40px;
}

/* Drop zone */
.drop-zone {
    border: 3px dashed #c8ccd1;
    border-radius: 12px;
    padding: 50px 30px;
    margin: 24px 0;
    transition: all 0.3s;
    cursor: pointer;
    background: #fafafa;
}

.drop-zone:hover, .drop-zone.drag-over {
    border-color: #c9a84c;
    background: #fdf8e8;
}

.drop-zone-icon { font-size: 48px; margin-bottom: 12px; }
.drop-zone-text { font-size: 18px; color: #333; }
.drop-zone-hint { font-size: 13px; color: #888; margin-top: 8px; }

/* Save file cards */
.saves-list {
    margin: 30px 0;
    text-align: left;
}

.saves-list h2 {
    text-align: center;
    border-bottom: none;
    margin-bottom: 16px;
}

.save-card {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
    margin: 8px 0;
    cursor: pointer;
    transition: all 0.2s;
    background: white;
    text-decoration: none;
    color: inherit;
}

.save-card:hover {
    border-color: #c9a84c;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    transform: translateY(-1px);
    text-decoration: none;
}

.save-icon {
    font-size: 32px;
    margin-right: 16px;
}

.save-info { flex: 1; text-align: left; }
.save-name { font-size: 16px; font-weight: bold; color: #1a1a2e; }
.save-detail { font-size: 12px; color: #888; margin-top: 2px; }

.save-arrow {
    font-size: 20px;
    color: #ccc;
}

/* Loading page */
.loading-container {
    max-width: 600px;
    margin: 80px auto;
    text-align: center;
    padding: 0 20px;
}

.loading-spinner {
    font-size: 48px;
    animation: spin 2s linear infinite;
    display: inline-block;
    margin-bottom: 20px;
}

@keyframes spin { to { transform: rotate(360deg); } }

.progress-bar-container {
    width: 100%;
    height: 24px;
    background: #eee;
    border-radius: 12px;
    overflow: hidden;
    margin: 20px 0;
}

.progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #c9a84c, #dabb5e);
    border-radius: 12px;
    transition: width 0.5s ease;
    width: 0%;
}

.progress-text {
    font-size: 14px;
    color: #666;
    margin-top: 8px;
}

/* Narrative text styling */
.narrative {
    font-size: 14px;
    line-height: 1.7;
    text-align: justify;
}

/* Footer */
.page-footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #ddd;
    font-size: 12px;
    color: #888;
    text-align: center;
}

/* See also section */
.see-also {
    margin: 20px 0;
}

.see-also ul {
    columns: 2;
    list-style: disc;
    padding-left: 24px;
}

/* Categories footer */
.categories {
    margin-top: 24px;
    padding: 8px 12px;
    background: #f8f9fa;
    border: 1px solid #ddd;
    font-size: 12px;
}

.categories a {
    margin-right: 8px;
}

/* Responsive */
@media (max-width: 768px) {
    .infobox {
        float: none;
        width: 100%;
        margin: 12px 0;
    }
    .portal-grid { grid-template-columns: 1fr; }
    .portal-stats { grid-template-columns: 1fr 1fr; }
    .header-nav { display: none; }
}

/* Clear float helper */
.clearfix::after {
    content: "";
    display: table;
    clear: both;
}
"""
