"""
Claude API-powered narrative generation for CK3 Wikipedia articles.
Uses raw urllib (no pip dependencies) to call the Anthropic API.
Caches generated narratives to avoid re-generating on revisit.
"""

import json
import os
import hashlib
import urllib.request
import urllib.error
from typing import Any, Dict, Optional

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-4-20250514"
CACHE_DIR = None  # Set during init


def init_cache(output_dir: str):
    """Initialize the narrative cache directory."""
    global CACHE_DIR
    CACHE_DIR = os.path.join(output_dir, "_narrative_cache")
    os.makedirs(CACHE_DIR, exist_ok=True)


def _cache_key(entity_type: str, entity_id: str) -> str:
    return os.path.join(CACHE_DIR, f"{entity_type}_{entity_id}.json")


def get_cached(entity_type: str, entity_id: str) -> Optional[str]:
    """Return cached narrative HTML if available."""
    path = _cache_key(entity_type, entity_id)
    if os.path.exists(path):
        with open(path, 'r') as f:
            data = json.load(f)
            return data.get("html")
    return None


def set_cached(entity_type: str, entity_id: str, html: str):
    """Cache a generated narrative."""
    path = _cache_key(entity_type, entity_id)
    with open(path, 'w') as f:
        json.dump({"html": html}, f)


def call_claude(api_key: str, system_prompt: str, user_prompt: str) -> Optional[str]:
    """Call the Claude API and return the text response."""
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    body = json.dumps({
        "model": MODEL,
        "max_tokens": 4096,
        "system": system_prompt,
        "messages": [{"role": "user", "content": user_prompt}],
    }).encode("utf-8")

    req = urllib.request.Request(API_URL, data=body, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
            if "content" in result and len(result["content"]) > 0:
                return result["content"][0].get("text", "")
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        print(f"  Claude API error {e.code}: {error_body[:200]}")
        return None
    except Exception as e:
        print(f"  Claude API error: {e}")
        return None

    return None


SYSTEM_PROMPT = """You are a master medieval historian writing for an encyclopedia. You write in the style of Wikipedia — authoritative, detailed, engaging third-person prose with a scholarly tone.

You are documenting characters, wars, dynasties, and realms from a Crusader Kings III campaign as if they were real historical figures and events.

IMPORTANT RULES:
- Write in HTML format (use <p>, <h3>, <h4>, <ul>, <li>, <em>, <strong> tags)
- Do NOT include <h1> or <h2> tags (those are handled by the page template)
- Cross-reference other characters/entities using links: <a href="/character/ID">Name</a>, <a href="/war/INDEX">War Name</a>, <a href="/title/ID">Title</a>, <a href="/dynasty/ID">Dynasty</a>
- Calculate ages from dates (CK3 date format: YYYY.MM.DD)
- Infer personality, political style, and motivations from traits
- Make it feel like a real historical Wikipedia article — rich, detailed, nuanced
- Include section headers as <h3> tags
- Do NOT repeat structured data that appears in the infobox (birth date, death date, spouse list) — instead weave these facts naturally into the narrative
- Write 400-800 words for characters, 300-600 for wars, 200-400 for realms/dynasties"""


def generate_character_narrative(
    api_key: str,
    character: Dict[str, Any],
    related_chars: Dict[str, Dict],
    wars: list,
    titles: Dict[str, Dict],
    game_date: str,
) -> str:
    """Generate a Wikipedia-style narrative for a character."""
    char_id = character["id"]

    # Check cache
    cached = get_cached("character", char_id)
    if cached:
        return cached

    # Build context about related people
    family_context = []
    for parent in character.get("parents", []):
        pid = parent["id"]
        if pid in related_chars:
            p = related_chars[pid]
            family_context.append(f"- {parent['role'].title()}: {p.get('first_name', 'Unknown')} (ID:{pid}), traits: {p.get('traits', [])}, titles: {p.get('titles_held', [])}")

    for sid in character.get("spouses", []):
        if sid in related_chars:
            s = related_chars[sid]
            family_context.append(f"- Spouse: {s.get('first_name', 'Unknown')} (ID:{sid}), culture: {s.get('culture')}, faith: {s.get('faith')}, traits: {s.get('traits', [])}")

    for cid in character.get("children", []):
        if cid in related_chars:
            c = related_chars[cid]
            family_context.append(f"- Child: {c.get('first_name', 'Unknown')} (ID:{cid}), {'alive' if c.get('alive') else 'dead'}, traits: {c.get('traits', [])}")

    # Wars involving this character
    char_wars = []
    for i, war in enumerate(wars):
        if char_id in (war.get("attacker_ids", []) + war.get("defender_ids", []) +
                        [war.get("primary_attacker", ""), war.get("primary_defender", "")]):
            char_wars.append(f"- War (index {i}): {war['name']}, role: {'attacker' if char_id in war.get('attacker_ids', []) or char_id == war.get('primary_attacker') else 'defender'}, "
                           f"CB: {war.get('casus_belli')}, dates: {war.get('start_date')} to {war.get('end_date', 'ongoing')}, result: {war.get('result', 'ongoing')}, "
                           f"battles: {len(war.get('battles', []))}")

    # Titles context
    title_context = []
    for tid in character.get("titles_held", []):
        for title_id, t in titles.items():
            if t.get("key") == tid:
                title_context.append(f"- {t['name']} ({t['tier']}), key: {tid}")
                break

    prompt = f"""Write a Wikipedia-style biographical article for this character from a CK3 campaign.

CHARACTER DATA:
{json.dumps(character, indent=2, default=str)}

CURRENT GAME DATE: {game_date}

FAMILY:
{chr(10).join(family_context) if family_context else "No known family data"}

TITLES HELD:
{chr(10).join(title_context) if title_context else "No titles"}

WARS INVOLVED IN:
{chr(10).join(char_wars) if char_wars else "No wars"}

Write the narrative body of their Wikipedia article. Include sections for:
- Early Life (infer from parents, culture, birth date, education traits)
- Character and Personality (based on traits — be vivid and specific)
- Reign/Career (if they held titles; discuss governance style based on skills)
- Military Campaigns (if they fought in wars; reference specific battles)
- Personal Life (marriages, children, family dynamics)
- Death (if dead) or Current Status (if alive, mention age as of {game_date})
- Legacy (brief assessment)

Use <a href="/character/ID">Name</a> format for character links, <a href="/war/INDEX">War Name</a> for war links, <a href="/title/ID">Title</a> for title links.
Only include sections where you have data to support them."""

    html = call_claude(api_key, SYSTEM_PROMPT, prompt)

    if html:
        set_cached("character", char_id, html)
        return html

    return "<p><em>Narrative generation failed. Check your API key and try refreshing.</em></p>"


def generate_war_narrative(
    api_key: str,
    war: Dict[str, Any],
    war_index: int,
    related_chars: Dict[str, Dict],
    titles: Dict[str, Dict],
    game_date: str,
) -> str:
    """Generate a Wikipedia-style narrative for a war."""
    cache_id = str(war_index)

    cached = get_cached("war", cache_id)
    if cached:
        return cached

    # Gather belligerent info
    attacker_info = []
    for aid in war.get("attacker_ids", []):
        if aid in related_chars:
            a = related_chars[aid]
            role = " (war leader)" if aid == war.get("primary_attacker") else ""
            attacker_info.append(f"- {a.get('first_name', 'Unknown')}{role} (ID:{aid}), titles: {a.get('titles_held', [])}")

    defender_info = []
    for did in war.get("defender_ids", []):
        if did in related_chars:
            d = related_chars[did]
            role = " (war leader)" if did == war.get("primary_defender") else ""
            defender_info.append(f"- {d.get('first_name', 'Unknown')}{role} (ID:{did}), titles: {d.get('titles_held', [])}")

    battles_info = []
    for b in war.get("battles", []):
        att_cmd = related_chars.get(str(b.get("attacker_commander", "")), {}).get("first_name", "Unknown")
        def_cmd = related_chars.get(str(b.get("defender_commander", "")), {}).get("first_name", "Unknown")
        battles_info.append(
            f"- Battle at {b.get('location', 'unknown')}, {b.get('date')}: "
            f"attacker cmd: {att_cmd}, defender cmd: {def_cmd}, "
            f"attacker losses: {b.get('attacker_losses')}, defender losses: {b.get('defender_losses')}, "
            f"result: {b.get('result')}"
        )

    prompt = f"""Write a Wikipedia-style article about this war from a CK3 campaign.

WAR DATA:
{json.dumps(war, indent=2, default=str)}

CURRENT GAME DATE: {game_date}

ATTACKERS:
{chr(10).join(attacker_info) if attacker_info else "Unknown"}

DEFENDERS:
{chr(10).join(defender_info) if defender_info else "Unknown"}

BATTLES:
{chr(10).join(battles_info) if battles_info else "No recorded battles"}

Write the narrative body including:
- Background (why the war started, political context inferred from casus belli)
- Course of the War (describe each battle dramatically, reference commanders)
- Aftermath/Result (consequences for both sides)

Use <a href="/character/ID">Name</a> for character links."""

    html = call_claude(api_key, SYSTEM_PROMPT, prompt)

    if html:
        set_cached("war", cache_id, html)
        return html

    return "<p><em>Narrative generation failed. Check your API key and try refreshing.</em></p>"


def generate_realm_narrative(
    api_key: str,
    title: Dict[str, Any],
    holder: Optional[Dict],
    neighbors: list,
    related_chars: Dict[str, Dict],
    game_date: str,
) -> str:
    """Generate a Wikipedia-style narrative for a realm/title."""
    cache_id = str(title.get("id", title.get("key", "unknown")))

    cached = get_cached("realm", cache_id)
    if cached:
        return cached

    neighbors_info = []
    for n in neighbors:
        neighbors_info.append(f"- {n['title_name']} ({n['tier']}), ruler: {n.get('holder_name', 'Unknown')} (ID:{n.get('holder_id')})")

    prompt = f"""Write a Wikipedia-style article about this realm/title from a CK3 campaign.

TITLE DATA:
{json.dumps(title, indent=2, default=str)}

CURRENT HOLDER:
{json.dumps(holder, indent=2, default=str) if holder else "Unknown"}

NEIGHBORING REALMS:
{chr(10).join(neighbors_info) if neighbors_info else "No known neighbors"}

CURRENT GAME DATE: {game_date}

Write the narrative body including:
- Overview (significance, geography inferred from name)
- Current Ruler (brief description with link)
- History (based on title history data if available)
- Bordering Realms (political relationships)

Use <a href="/character/ID">Name</a> for character links, <a href="/title/ID">Title</a> for title links."""

    html = call_claude(api_key, SYSTEM_PROMPT, prompt)

    if html:
        set_cached("realm", cache_id, html)
        return html

    return "<p><em>Narrative generation failed. Check your API key and try refreshing.</em></p>"


def generate_dynasty_narrative(
    api_key: str,
    dynasty: Dict[str, Any],
    members: list,
    game_date: str,
) -> str:
    """Generate a Wikipedia-style narrative for a dynasty."""
    cache_id = str(dynasty.get("id", "unknown"))

    cached = get_cached("dynasty", cache_id)
    if cached:
        return cached

    members_info = []
    for m in members[:20]:  # Cap at 20 to avoid huge prompts
        members_info.append(
            f"- {m.get('first_name', 'Unknown')} (ID:{m['id']}), "
            f"{'alive' if m.get('alive') else 'dead'}, "
            f"titles: {m.get('titles_held', [])}, "
            f"traits: {m.get('traits', [])}"
        )

    prompt = f"""Write a Wikipedia-style article about this dynasty from a CK3 campaign.

DYNASTY DATA:
{json.dumps(dynasty, indent=2, default=str)}

NOTABLE MEMBERS:
{chr(10).join(members_info) if members_info else "No known members"}

CURRENT GAME DATE: {game_date}

Write the narrative body including:
- Origins (founding, early history)
- Notable Members (brief descriptions with links)
- Legacy and Influence

Use <a href="/character/ID">Name</a> for character links."""

    html = call_claude(api_key, SYSTEM_PROMPT, prompt)

    if html:
        set_cached("dynasty", cache_id, html)
        return html

    return "<p><em>Narrative generation failed. Check your API key and try refreshing.</em></p>"
