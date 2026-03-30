"""HTML page generators for the CK3 Wikipedia browser."""

from typing import Any, Dict, List, Optional
from .styles import WIKI_CSS
from . import narrator

MONTHS = ["January","February","March","April","May","June",
          "July","August","September","October","November","December"]


def ck3_date_to_str(d: Optional[str]) -> str:
    if not d: return "Unknown"
    parts = str(d).split(".")
    if len(parts) == 3:
        try:
            return f"{MONTHS[int(parts[1])-1]} {int(parts[2])}, {parts[0]}"
        except (ValueError, IndexError):
            pass
    return str(d)


def calculate_age(birth: Optional[str], end: Optional[str]) -> Optional[int]:
    if not birth or not end: return None
    try:
        bp = [int(x) for x in str(birth).split(".")]
        ep = [int(x) for x in str(end).split(".")]
        age = ep[0] - bp[0]
        if (ep[1], ep[2]) < (bp[1], bp[2]): age -= 1
        return age
    except (ValueError, IndexError):
        return None


def resolve_name(cid, chars):
    if not cid: return "Unknown"
    c = chars.get(str(cid))
    return c.get("first_name", "Unknown") if c else "Unknown"


def char_link(cid, chars):
    name = resolve_name(cid, chars)
    return f'<a href="/character/{cid}">{name}</a>'


def classify_trait(t):
    personality = {"brave","craven","calm","wrathful","chaste","lustful","content","ambitious",
        "diligent","lazy","fickle","stubborn","generous","greedy","gregarious","shy","honest",
        "deceitful","humble","arrogant","just","arbitrary","compassionate","callous","cynical",
        "zealous","paranoid","trusting","patient","impatient","temperate","gluttonous","forgiving","vengeful"}
    education = {f"education_{t}_{n}" for t in ["diplomacy","martial","stewardship","intrigue","learning"] for n in range(1,5)}
    congenital = {"beauty_bad_1","beauty_bad_2","beauty_bad_3","beauty_good_1","beauty_good_2","beauty_good_3",
        "intellect_bad_1","intellect_bad_2","intellect_bad_3","intellect_good_1","intellect_good_2","intellect_good_3",
        "physique_bad_1","physique_bad_2","physique_bad_3","physique_good_1","physique_good_2","physique_good_3",
        "strong","athletic","giant","dwarf","hunchback","clubfooted","lisping","stuttering","albino","scaly"}
    commander = {"logistician","military_engineer","aggressive_attacker","unyielding_defender","forder",
        "flexible_leader","organizer","reaver","holy_warrior","open_terrain_expert","rough_terrain_expert"}
    criminal = {"murderer","known_murderer","cannibal","deviant","witch","heresiarch","excommunicated",
        "kinslayer_1","kinslayer_2","kinslayer_3","adulterer","fornicator","sodomite","incestuous"}
    health = {"wounded_1","wounded_2","wounded_3","ill","pneumonic","leper","has_tuberculosis",
        "cancer","great_pox","early_great_pox","lovers_pox","infertile","eunuch","one_eyed","one_legged","disfigured","scarred"}
    lifestyle = {"berserker","varangian","shieldmaiden","crusader_king","saint","drunkard","hashishiyah",
        "rakish","lifestyle_reveler","lifestyle_hunter","lifestyle_mystic","lifestyle_herbalist",
        "lifestyle_traveler","pilgrim","poet","gallant"}
    if t in personality: return "trait-personality"
    if t in education: return "trait-education"
    if t in congenital: return "trait-congenital"
    if t in commander: return "trait-commander"
    if t in criminal: return "trait-criminal"
    if t in health: return "trait-health"
    if t in lifestyle: return "trait-lifestyle"
    return "trait-other"


def skill_class(v):
    try: v = int(v)
    except: return "skill-avg"
    if v <= 5: return "skill-low"
    if v <= 10: return "skill-avg"
    if v <= 15: return "skill-good"
    if v <= 20: return "skill-great"
    return "skill-legendary"


def _esc(s):
    """HTML escape."""
    return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"',"&quot;")


def base_html(title, content, game_data=None):
    nav = ""
    if game_data:
        nav = f'''<div class="header-nav">
            <a href="/portal">Home</a>
            <a href="/characters">Characters</a>
            <a href="/wars">Wars</a>
            <a href="/dynasties">Dynasties</a>
            <a href="/neighbors">Neighbors</a>
        </div>
        <form class="header-search" action="/search" method="get">
            <input type="text" name="q" placeholder="Search characters, wars...">
            <button type="submit">Search</button>
        </form>'''

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_esc(title)} — CK3 Encyclopedia</title>
<style>{WIKI_CSS}</style>
</head>
<body>
<div class="site-header">
    <h1><a href="{'/portal' if game_data else '/'}">CK3 Encyclopedia</a></h1>
    {nav}
</div>
<div class="content-wrapper">
<div class="page-content">
{content}
</div>
</div>
<div class="page-footer">CK3 Save Browser &mdash; Powered by Claude</div>
</body>
</html>'''


def landing_page(saves):
    save_cards = ""
    for s in saves:
        save_cards += f'''<a class="save-card" href="#" onclick="loadSave('{_esc(s['path'])}'); return false;">
            <span class="save-icon">&#x1f4dc;</span>
            <div class="save-info">
                <div class="save-name">{_esc(s['name'])}</div>
                <div class="save-detail">{s['size_mb']} MB</div>
            </div>
            <span class="save-arrow">&#x276f;</span>
        </a>'''

    saves_section = ""
    if save_cards:
        saves_section = f'''<div class="saves-list">
            <h2>Detected Save Files</h2>
            {save_cards}
        </div>'''

    return base_html("Welcome", f'''
<div class="landing-container">
    <div class="landing-logo">&#x1f451;</div>
    <div class="landing-title">CK3 Save Browser</div>
    <div class="landing-subtitle">An interactive Wikipedia for your Crusader Kings III campaign</div>

    <div style="margin: 24px 0; text-align: left; max-width: 400px; margin-left: auto; margin-right: auto;">
        <label style="font-weight: bold; display: block; margin-bottom: 6px;">Claude API Key</label>
        <input type="password" id="api-key" placeholder="sk-ant-..."
               style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px;">
        <div style="font-size: 11px; color: #888; margin-top: 4px;">Required for generating narrative descriptions</div>
    </div>

    <form id="upload-form" enctype="multipart/form-data" method="post" action="/upload">
        <input type="hidden" name="api_key" id="form-api-key">
        <label class="drop-zone" id="drop-zone" for="file-input">
            <div class="drop-zone-icon">&#x1f4c2;</div>
            <div class="drop-zone-text">Drag &amp; drop your .ck3 save file here</div>
            <div class="drop-zone-hint">or click to browse</div>
            <input type="file" name="save_file" id="file-input" accept=".ck3"
                   style="display:none" onchange="uploadFile()">
        </label>
    </form>

    {saves_section}
</div>

<script>
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => {{ e.preventDefault(); dropZone.classList.add('drag-over'); }});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {{
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {{
        document.getElementById('file-input').files = files;
        uploadFile();
    }}
}});

function uploadFile() {{
    const key = document.getElementById('api-key').value;
    if (!key) {{ alert('Please enter your Claude API key first.'); return; }}
    document.getElementById('form-api-key').value = key;
    document.getElementById('upload-form').submit();
}}

function loadSave(path) {{
    const key = document.getElementById('api-key').value;
    if (!key) {{ alert('Please enter your Claude API key first.'); return; }}
    window.location = '/load?path=' + encodeURIComponent(path) + '&api_key=' + encodeURIComponent(key);
}}
</script>''')


def loading_page(save_name):
    return base_html("Loading...", f'''
<div class="loading-container">
    <div class="loading-spinner">&#x2699;</div>
    <h2>Parsing Save File</h2>
    <p style="color: #666;">{_esc(save_name)}</p>
    <div class="progress-bar-container">
        <div class="progress-bar" id="progress-bar"></div>
    </div>
    <div class="progress-text" id="progress-text">Starting...</div>
</div>
<script>
function poll() {{
    fetch('/parse-status').then(r => r.json()).then(data => {{
        document.getElementById('progress-bar').style.width = data.percent + '%';
        document.getElementById('progress-text').textContent = data.progress;
        if (data.done) {{ window.location = '/portal'; }}
        else {{ setTimeout(poll, 1500); }}
    }}).catch(() => setTimeout(poll, 2000));
}}
poll();
</script>''')


def portal_page(gd):
    chars = gd.get("characters", {})
    meta = gd.get("meta", {})
    stats = gd.get("stats", {})
    player_id = gd.get("player_id")
    player = chars.get(str(player_id), {}) if player_id else {}
    player_name = player.get("first_name", meta.get("player_name", "Unknown"))

    stat_cards = ""
    for label, key in [("Living Characters","living_characters"),("Dead Characters","dead_characters"),
                        ("Active Wars","active_wars"),("Total Wars","total_wars"),
                        ("Titles","total_titles"),("Dynasties","total_dynasties")]:
        stat_cards += f'<div class="stat-card"><span class="stat-number">{stats.get(key,0)}</span><span class="stat-label">{label}</span></div>'

    player_section = ""
    if player_id and player:
        titles_str = ", ".join(player.get("titles_held", [])[:3]) or "No titles"
        player_section = f'''<div class="portal-box">
            <h3>Your Ruler</h3>
            <div class="char-list-item">
                <div class="char-icon">&#x1f451;</div>
                <div class="char-info">
                    <div class="char-name"><a href="/character/{player_id}">{_esc(player_name)}</a></div>
                    <div class="char-detail">{_esc(titles_str)}</div>
                </div>
            </div>
        </div>'''

    wars = gd.get("wars", [])
    wars_html = ""
    for i, w in enumerate(wars):
        if not w.get("concluded"):
            wars_html += f'<li><a href="/war/{i}">{_esc(w.get("name","Unknown War"))}</a></li>'
    if not wars_html: wars_html = "<li>No active wars</li>"
    wars_section = f'<div class="portal-box"><h3>Active Wars</h3><ul>{wars_html}</ul></div>'

    neighbors = gd.get("neighbors", [])
    neighbors_html = ""
    for n in neighbors[:8]:
        neighbors_html += f'<li><a href="/title/{n["title_id"]}">{_esc(n["title_name"])}</a> — ruled by {char_link(n["holder_id"], chars)}</li>'
    if not neighbors_html: neighbors_html = "<li>No known neighbors</li>"
    neighbors_section = f'<div class="portal-box"><h3>Neighboring Realms</h3><ul>{neighbors_html}</ul></div>'

    notable = [c for cid, c in chars.items() if c.get("titles_held") and cid != str(player_id)]
    notable.sort(key=lambda c: len(c.get("titles_held",[])), reverse=True)
    notable_html = ""
    for c in notable[:10]:
        notable_html += f'<li>{char_link(c["id"], chars)} — {_esc(", ".join(c.get("titles_held",[])[:2]))}</li>'
    if not notable_html: notable_html = "<li>No notable characters found</li>"
    notable_section = f'<div class="portal-box"><h3>Notable Characters</h3><ul>{notable_html}</ul></div>'

    return base_html(f"Chronicles of {player_name}", f'''
<h1 class="page-title">Chronicles of {_esc(player_name)}'s Realm</h1>
<p class="hatnote">A Crusader Kings III Campaign Encyclopedia &mdash; Current date: {ck3_date_to_str(meta.get("date"))}</p>
<div class="portal-stats">{stat_cards}</div>
<div class="portal-grid">{player_section}{wars_section}{neighbors_section}{notable_section}</div>
''', game_data=gd)


def character_page(char, gd, api_key):
    chars = gd.get("characters", {})
    wars = gd.get("wars", [])
    titles = gd.get("titles", {})
    meta = gd.get("meta", {})
    game_date = str(meta.get("date", ""))
    name = char.get("first_name", "Unknown")
    nickname = char.get("nickname")
    title_text = f'"{nickname}"' if nickname else ""
    female = char.get("female", False)

    born = ck3_date_to_str(char.get("birth_date"))
    died = ck3_date_to_str(char.get("death_date")) if char.get("death_date") else None
    age = calculate_age(char.get("birth_date"), game_date) if char.get("alive") else calculate_age(char.get("birth_date"), char.get("death_date"))
    age_str = f" (aged {age})" if age else ""

    def info_row(label, val):
        return f'<div class="infobox-row"><div class="infobox-label">{label}</div><div class="infobox-value">{val}</div></div>'

    rows = info_row("Born", born)
    if died:
        dr = str(char.get("death_reason","")).replace("death_","").replace("_"," ").title()
        rows += info_row("Died", f'{died}{age_str}' + (f'<br><small>{dr}</small>' if dr else ""))
    elif char.get("alive"):
        rows += info_row("Status", f'Alive{age_str}')

    spouses = char.get("spouses", [])
    if spouses: rows += info_row("Spouse(s)", ", ".join(char_link(s, chars) for s in spouses))
    children = char.get("children", [])
    if children: rows += info_row("Children", ", ".join(char_link(c, chars) for c in children))
    for p in char.get("parents", []):
        rows += info_row(p["role"].title(), char_link(p["id"], chars))

    dyn_id = char.get("dynasty_house")
    if dyn_id:
        dyn = gd.get("dynasties", {}).get(str(dyn_id), {})
        dyn_name = dyn.get("name", f"House {dyn_id}")
        rows += info_row("Dynasty", f'<a href="/dynasty/{dyn_id}">{_esc(dyn_name)}</a>')

    rows += info_row("Culture", _esc(str(char.get("culture","Unknown")).replace("_"," ").title()))
    rows += info_row("Faith", _esc(str(char.get("faith","Unknown")).replace("_"," ").title()))

    titles_held = char.get("titles_held", [])
    if titles_held:
        t_links = []
        for tid in titles_held:
            found = False
            for title_id, t in titles.items():
                if t.get("key") == tid:
                    t_links.append(f'<a href="/title/{title_id}">{_esc(t.get("name", tid))}</a>')
                    found = True
                    break
            if not found: t_links.append(_esc(tid.replace("_"," ").title()))
        rows += info_row("Titles", "<br>".join(t_links))

    skills = char.get("skills", {})
    skills_html = ""
    if skills:
        sh = "".join(f'<th>{s.title()}</th>' for s in ["diplomacy","martial","stewardship","intrigue","learning","prowess"])
        sv = "".join(f'<td class="{skill_class(skills.get(s,0))}">{skills.get(s,0)}</td>' for s in ["diplomacy","martial","stewardship","intrigue","learning","prowess"])
        skills_html = f'<div class="infobox-section">Skills</div><table class="skills-table"><tr>{sh}</tr><tr>{sv}</tr></table>'

    trait_pills = "".join(f'<span class="trait-pill {classify_trait(t)}">{_esc(t.replace("_"," ").title())}</span>' for t in char.get("traits", []))
    traits_html = f'<div class="infobox-section">Traits</div><div class="trait-pills">{trait_pills}</div>' if trait_pills else ""

    wealth_rows = ""
    for stat, label in [("gold","Gold"),("prestige","Prestige"),("piety","Piety"),("dread","Dread")]:
        val = char.get(stat)
        if val is not None:
            wealth_rows += info_row(label, f"{val:,.0f}" if isinstance(val, float) else str(val))

    infobox = f'''<div class="infobox">
        <div class="infobox-title">{_esc(name)}</div>
        {f'<div class="infobox-subtitle">{_esc(title_text)}</div>' if title_text else ""}
        <div class="infobox-image">{"&#x1f478;" if female else "&#x1f934;"}</div>
        <div class="infobox-section">Biographical</div>{rows}{skills_html}{traits_html}
        {f'<div class="infobox-section">Wealth &amp; Status</div>{wealth_rows}' if wealth_rows else ""}
    </div>'''

    related_ids = set(str(s) for s in spouses) | set(str(c) for c in children)
    for p in char.get("parents", []): related_ids.add(str(p["id"]))
    if char.get("killer_id"): related_ids.add(str(char["killer_id"]))
    related_chars = {cid: chars[cid] for cid in related_ids if cid in chars}

    narrative_html = narrator.generate_character_narrative(api_key, char, related_chars, wars, titles, game_date)

    return base_html(name, f'''
<h1 class="page-title">{_esc(name)} {_esc(title_text)}</h1>
<div class="clearfix">{infobox}<div class="narrative">{narrative_html}</div></div>
''', game_data=gd)


def war_page(war, war_index, gd, api_key):
    chars = gd.get("characters", {})
    titles = gd.get("titles", {})
    meta = gd.get("meta", {})
    game_date = str(meta.get("date", ""))
    name = war.get("name", "Unknown War")
    cb = str(war.get("casus_belli","Unknown")).replace("_"," ").title()
    start = ck3_date_to_str(war.get("start_date"))
    end = ck3_date_to_str(war.get("end_date")) if war.get("end_date") else "Ongoing"
    result = str(war.get("result","Ongoing")).replace("_"," ").title() if war.get("result") else "Ongoing"

    rows = f'<div class="infobox-row"><div class="infobox-label">Date</div><div class="infobox-value">{start} &ndash; {end}</div></div>'
    rows += f'<div class="infobox-row"><div class="infobox-label">Casus Belli</div><div class="infobox-value">{_esc(cb)}</div></div>'
    rows += f'<div class="infobox-row"><div class="infobox-label">Result</div><div class="infobox-value">{_esc(result)}</div></div>'
    if war.get("target_title"):
        rows += f'<div class="infobox-row"><div class="infobox-label">Target</div><div class="infobox-value">{_esc(str(war["target_title"]).replace("_"," ").title())}</div></div>'

    infobox = f'<div class="infobox"><div class="infobox-title">{_esc(name)}</div><div class="infobox-section">War Details</div>{rows}</div>'

    att_cells = "".join(f'<div>{char_link(a, chars)}{" <strong>(leader)</strong>" if a == war.get("primary_attacker") else ""}</div>' for a in war.get("attacker_ids", []))
    def_cells = "".join(f'<div>{char_link(d, chars)}{" <strong>(leader)</strong>" if d == war.get("primary_defender") else ""}</div>' for d in war.get("defender_ids", []))
    belligerents = f'<table class="belligerents-table"><tr><th class="belligerents-header-attacker">Attackers</th><th class="belligerents-header-defender">Defenders</th></tr><tr><td class="belligerents-attacker">{att_cells}</td><td class="belligerents-defender">{def_cells}</td></tr></table>'

    battles_html = ""
    battles = war.get("battles", [])
    if battles:
        br = ""
        for b in battles:
            br += f'<tr><td>{_esc(b.get("date",""))}</td><td>{_esc(b.get("location","?"))}</td><td>{resolve_name(b.get("attacker_commander"),chars)}</td><td>{resolve_name(b.get("defender_commander"),chars)}</td><td>{b.get("attacker_losses","?")}</td><td>{b.get("defender_losses","?")}</td><td>{_esc(str(b.get("result","")).replace("_"," ").title())}</td></tr>'
        battles_html = f'<h2>Recorded Battles</h2><table class="wikitable"><tr><th>Date</th><th>Location</th><th>Att. Cmd</th><th>Def. Cmd</th><th>Att. Losses</th><th>Def. Losses</th><th>Result</th></tr>{br}</table>'

    all_ids = set(war.get("attacker_ids",[]) + war.get("defender_ids",[]))
    for b in battles:
        for k in ["attacker_commander","defender_commander"]:
            if b.get(k): all_ids.add(str(b[k]))
    related_chars = {cid: chars[cid] for cid in all_ids if str(cid) in chars}
    narrative_html = narrator.generate_war_narrative(api_key, war, war_index, related_chars, titles, game_date)

    return base_html(name, f'''
<h1 class="page-title">{_esc(name)}</h1>
<div class="clearfix">{infobox}{belligerents}<div class="narrative">{narrative_html}</div>{battles_html}</div>
''', game_data=gd)


def title_page(title, gd, api_key):
    chars = gd.get("characters", {})
    meta = gd.get("meta", {})
    game_date = str(meta.get("date", ""))
    name = title.get("name", title.get("key", "Unknown"))
    tier = title.get("tier","unknown").title()
    holder_id = title.get("holder")
    holder = chars.get(str(holder_id)) if holder_id else None

    rows = f'<div class="infobox-row"><div class="infobox-label">Type</div><div class="infobox-value">{_esc(tier)}</div></div>'
    if holder: rows += f'<div class="infobox-row"><div class="infobox-label">Ruler</div><div class="infobox-value">{char_link(holder_id, chars)}</div></div>'
    if title.get("capital"): rows += f'<div class="infobox-row"><div class="infobox-label">Capital</div><div class="infobox-value">{_esc(str(title["capital"]).replace("_"," ").title())}</div></div>'
    infobox = f'<div class="infobox"><div class="infobox-title">{_esc(name)}</div><div class="infobox-section">{_esc(tier)}</div>{rows}</div>'

    history_html = ""
    hist = title.get("history", [])
    if hist:
        hr = "".join(f'<tr><td>{_esc(ck3_date_to_str(h.get("date")))}</td><td>{resolve_name(h.get("holder"),chars)}</td><td>{_esc(str(h.get("type","")).replace("_"," ").title())}</td></tr>' for h in hist)
        history_html = f'<h2>History of Rulers</h2><table class="wikitable"><tr><th>Date</th><th>Ruler</th><th>Succession</th></tr>{hr}</table>'

    neighbors = gd.get("neighbors", [])
    narrative_html = narrator.generate_realm_narrative(api_key, title, holder, neighbors, chars, game_date)

    return base_html(name, f'''
<h1 class="page-title">{_esc(name)}</h1>
<div class="clearfix">{infobox}<div class="narrative">{narrative_html}</div>{history_html}</div>
''', game_data=gd)


def dynasty_page(dynasty, gd, api_key):
    chars = gd.get("characters", {})
    meta = gd.get("meta", {})
    game_date = str(meta.get("date", ""))
    name = dynasty.get("name", "Unknown")
    dyn_id = str(dynasty.get("id", ""))

    rows = ""
    if dynasty.get("founder"): rows += f'<div class="infobox-row"><div class="infobox-label">Founder</div><div class="infobox-value">{char_link(dynasty["founder"], chars)}</div></div>'
    head_id = dynasty.get("head") or dynasty.get("head_of_house")
    if head_id: rows += f'<div class="infobox-row"><div class="infobox-label">Current Head</div><div class="infobox-value">{char_link(head_id, chars)}</div></div>'
    if dynasty.get("found_date"): rows += f'<div class="infobox-row"><div class="infobox-label">Founded</div><div class="infobox-value">{ck3_date_to_str(dynasty["found_date"])}</div></div>'
    if dynasty.get("motto"): rows += f'<div class="infobox-row"><div class="infobox-label">Motto</div><div class="infobox-value"><em>{_esc(dynasty["motto"])}</em></div></div>'
    infobox = f'<div class="infobox"><div class="infobox-title">{_esc(name)}</div><div class="infobox-section">Dynasty</div>{rows}</div>'

    members = sorted([c for c in chars.values() if str(c.get("dynasty_house")) == dyn_id], key=lambda c: c.get("birth_date","9999"))
    members_html = ""
    if members:
        mr = "".join(f'<tr><td>{char_link(m["id"],chars)}</td><td>{ck3_date_to_str(m.get("birth_date"))}</td><td>{"Alive" if m.get("alive") else "Dead"}</td><td>{", ".join(m.get("titles_held",[])[:2]) or "—"}</td></tr>' for m in members[:30])
        members_html = f'<h2>Known Members</h2><table class="wikitable"><tr><th>Name</th><th>Born</th><th>Status</th><th>Titles</th></tr>{mr}</table>'

    narrative_html = narrator.generate_dynasty_narrative(api_key, dynasty, members, game_date)

    return base_html(name, f'''
<h1 class="page-title">{_esc(name)}</h1>
<div class="clearfix">{infobox}<div class="narrative">{narrative_html}</div>{members_html}</div>
''', game_data=gd)


def characters_list_page(gd):
    chars = gd.get("characters", {})
    alive = sorted([(k,v) for k,v in chars.items() if v.get("alive")], key=lambda x: x[1].get("first_name",""))
    dead = sorted([(k,v) for k,v in chars.items() if not v.get("alive")], key=lambda x: x[1].get("first_name",""))

    def rows(lst):
        h = ""
        for cid, c in lst[:300]:
            icon = "&#x1f478;" if c.get("female") else "&#x1f934;"
            t = ", ".join(c.get("titles_held",[])[:2]) or "No titles"
            d = ck3_date_to_str(c.get("birth_date"))
            if c.get("death_date"): d += f' — {ck3_date_to_str(c["death_date"])}'
            h += f'<div class="char-list-item"><div class="char-icon">{icon}</div><div class="char-info"><div class="char-name"><a href="/character/{cid}">{_esc(c.get("first_name","Unknown"))}</a></div><div class="char-detail">{_esc(t)} &middot; {_esc(d)}</div></div></div>'
        return h

    return base_html("Characters", f'<h1 class="page-title">Characters</h1><h2>Living ({len(alive)})</h2>{rows(alive)}<h2>Dead ({len(dead)})</h2>{rows(dead)}', game_data=gd)


def wars_list_page(gd):
    wars = gd.get("wars", [])
    chars = gd.get("characters", {})
    active = [(i,w) for i,w in enumerate(wars) if not w.get("concluded")]
    concluded = [(i,w) for i,w in enumerate(wars) if w.get("concluded")]

    def rows(lst):
        h = ""
        for i,w in lst:
            h += f'<div class="char-list-item"><div class="char-icon">&#x2694;</div><div class="char-info"><div class="char-name"><a href="/war/{i}">{_esc(w.get("name","Unknown"))}</a></div><div class="char-detail">{resolve_name(w.get("primary_attacker"),chars)} vs {resolve_name(w.get("primary_defender"),chars)}</div></div></div>'
        return h or "<p>None</p>"

    return base_html("Wars", f'<h1 class="page-title">Wars</h1><h2>Active ({len(active)})</h2>{rows(active)}<h2>Concluded ({len(concluded)})</h2>{rows(concluded)}', game_data=gd)


def dynasties_list_page(gd):
    dyns = gd.get("dynasties", {})
    chars = gd.get("characters", {})
    items = ""
    for did, d in sorted(dyns.items(), key=lambda x: x[1].get("name","")):
        head_id = d.get("head") or d.get("head_of_house")
        items += f'<div class="char-list-item"><div class="char-icon">&#x1f3f0;</div><div class="char-info"><div class="char-name"><a href="/dynasty/{did}">{_esc(d.get("name","Unknown"))}</a></div><div class="char-detail">Head: {resolve_name(head_id,chars)}</div></div></div>'
    return base_html("Dynasties", f'<h1 class="page-title">Dynasties</h1>{items or "<p>No dynasties</p>"}', game_data=gd)


def neighbors_page(gd, api_key):
    neighbors = gd.get("neighbors", [])
    chars = gd.get("characters", {})
    player = chars.get(str(gd.get("player_id")), {})
    items = ""
    for n in neighbors:
        holder = chars.get(str(n.get("holder_id")), {})
        items += f'<div class="portal-box" style="margin-bottom:16px"><h3><a href="/title/{n["title_id"]}">{_esc(n["title_name"])}</a></h3><p><strong>Ruler:</strong> {char_link(n["holder_id"],chars)} &middot; <strong>Type:</strong> {_esc(n.get("tier","").title())}</p><p>Culture: {_esc(str(holder.get("culture","")).replace("_"," ").title())} &middot; Faith: {_esc(str(holder.get("faith","")).replace("_"," ").title())}</p></div>'
    return base_html("Neighboring Realms", f'<h1 class="page-title">Neighboring Realms</h1><p class="hatnote">The political landscape surrounding {_esc(player.get("first_name","the player"))}\'s domain</p>{items or "<p>No neighbors detected</p>"}', game_data=gd)


def search_results_page(query, results, gd):
    items = ""
    icons = {"character":"&#x1f464;","war":"&#x2694;","title":"&#x1f3f0;","dynasty":"&#x1f451;"}
    for r in results:
        icon = icons.get(r["type"], "&#x1f4c4;")
        url = f'/{r["type"]}/{r["id"]}'
        items += f'<div class="char-list-item"><div class="char-icon">{icon}</div><div class="char-info"><div class="char-name"><a href="{url}">{_esc(r["name"])}</a></div><div class="char-detail">{_esc(r.get("detail",""))}</div></div></div>'
    return base_html(f"Search: {query}", f'<h1 class="page-title">Search: "{_esc(query)}"</h1><p>{len(results)} results</p>{items or "<p>No results found.</p>"}', game_data=gd)
