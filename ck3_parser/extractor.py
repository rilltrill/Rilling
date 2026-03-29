"""
Extracts structured game entities from parsed CK3 save data.
Produces clean, JSON-serializable dicts for characters, wars, dynasties, and titles.
"""

from typing import Any, Dict, List, Optional, Tuple


# CK3 trait ID -> name mapping (common traits)
TRAIT_NAMES = {
    0: "education_diplomacy_1", 1: "education_diplomacy_2", 2: "education_diplomacy_3",
    3: "education_diplomacy_4", 4: "education_martial_1", 5: "education_martial_2",
    6: "education_martial_3", 7: "education_martial_4", 8: "education_stewardship_1",
    9: "education_stewardship_2", 10: "education_stewardship_3", 11: "education_stewardship_4",
    12: "education_intrigue_1", 13: "education_intrigue_2", 14: "education_intrigue_3",
    15: "education_intrigue_4", 16: "education_learning_1", 17: "education_learning_2",
    18: "education_learning_3", 19: "education_learning_4",
    20: "diplomacy_1", 21: "diplomacy_2", 22: "diplomacy_3", 23: "diplomacy_4", 24: "diplomacy_5",
    25: "martial_1", 26: "martial_2", 27: "martial_3", 28: "martial_4", 29: "martial_5",
    30: "stewardship_1", 31: "stewardship_2", 32: "stewardship_3", 33: "stewardship_4",
    34: "stewardship_5",
    35: "intrigue_1", 36: "intrigue_2", 37: "intrigue_3", 38: "intrigue_4", 39: "intrigue_5",
    40: "learning_1", 41: "learning_2", 42: "learning_3", 43: "learning_4", 44: "learning_5",
    # Personality traits
    45: "brave", 46: "craven", 47: "calm", 48: "wrathful", 49: "chaste",
    50: "lustful", 51: "content", 52: "ambitious", 53: "diligent", 54: "lazy",
    55: "fickle", 56: "stubborn", 57: "generous", 58: "greedy", 59: "gregarious",
    60: "shy", 61: "honest", 62: "deceitful", 63: "humble", 64: "arrogant",
    65: "just", 66: "arbitrary", 67: "compassionate", 68: "callous",
    69: "cynical", 70: "zealous", 71: "paranoid", 72: "trusting",
    73: "patient", 74: "impatient", 75: "temperate", 76: "gluttonous",
    77: "forgiving", 78: "vengeful",
    # Congenital
    79: "beauty_bad_1", 80: "beauty_bad_2", 81: "beauty_bad_3",
    82: "beauty_good_1", 83: "beauty_good_2", 84: "beauty_good_3",
    85: "intellect_bad_1", 86: "intellect_bad_2", 87: "intellect_bad_3",
    88: "intellect_good_1", 89: "intellect_good_2", 90: "intellect_good_3",
    91: "physique_bad_1", 92: "physique_bad_2", 93: "physique_bad_3",
    94: "physique_good_1", 95: "physique_good_2", 96: "physique_good_3",
    # Health/lifestyle
    97: "wounded_1", 98: "wounded_2", 99: "wounded_3",
    100: "ill", 101: "pneumonic", 102: "leper", 103: "has_tuberculosis",
    104: "cancer", 105: "great_pox", 106: "early_great_pox", 107: "lovers_pox",
    108: "infertile", 109: "eunuch",
    # Famous
    110: "berserker", 111: "varangian", 112: "shieldmaiden",
    113: "crusader_king", 114: "saint", 115: "divine_blood",
    116: "sayyid", 117: "mirza",
    # Misc
    118: "strong", 119: "athletic", 120: "giant",
    121: "dwarf", 122: "hunchback", 123: "clubfooted",
    124: "lisping", 125: "stuttering", 126: "albino",
    127: "scaly", 128: "one_eyed", 129: "one_legged",
    130: "disfigured", 131: "spindly", 132: "scarred",
    # Commander
    133: "logistician", 134: "military_engineer", 135: "aggressive_attacker",
    136: "unyielding_defender", 137: "forder", 138: "flexible_leader",
    139: "organizer", 140: "reaver", 141: "holy_warrior",
    142: "open_terrain_expert", 143: "rough_terrain_expert",
    # Criminal
    144: "murderer", 145: "known_murderer", 146: "cannibal",
    147: "deviant", 148: "witch", 149: "heresiarch",
    150: "excommunicated", 151: "kinslayer_1", 152: "kinslayer_2", 153: "kinslayer_3",
    154: "adulterer", 155: "fornicator", 156: "sodomite",
    157: "incestuous",
    # Lifestyle
    158: "drunkard", 159: "hashishiyah", 160: "rakish",
    161: "lifestyle_reveler", 162: "lifestyle_hunter",
    163: "lifestyle_mystic", 164: "lifestyle_herbalist",
    165: "lifestyle_traveler", 166: "pilgrim",
    167: "poet", 168: "gallant",
}

SKILL_NAMES = ["diplomacy", "martial", "stewardship", "intrigue", "learning", "prowess"]


def _ensure_list(val: Any) -> List:
    """Wrap a value in a list if it isn't one already."""
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return [val]


def _get_date(val: Any) -> Optional[str]:
    """Convert a CK3 date value to string."""
    if val is None:
        return None
    return str(val)


def resolve_trait(trait_id: Any) -> str:
    """Convert a trait ID to a human-readable name."""
    if isinstance(trait_id, int):
        return TRAIT_NAMES.get(trait_id, f"trait_{trait_id}")
    return str(trait_id)


class CK3Extractor:
    """Extracts structured entities from a parsed CK3 save dict."""

    def __init__(self, save_data: Dict[str, Any]):
        self.data = save_data
        self._characters_cache: Optional[Dict[str, Any]] = None

    def _get_section(self, *keys: str) -> Any:
        """Navigate into nested dict by key path."""
        current = self.data
        for key in keys:
            if isinstance(current, dict) and key in current:
                current = current[key]
            else:
                return None
        return current

    def get_meta(self) -> Dict[str, Any]:
        """Extract save metadata."""
        meta = self._get_section("meta_data") or {}
        return {
            "version": meta.get("version", "unknown"),
            "date": _get_date(self._get_section("date") or self._get_section("meta_data", "meta_date")),
            "player_name": meta.get("meta_player_name", "Unknown"),
            "ironman": meta.get("meta_ironman", False),
        }

    def get_all_characters(self) -> Dict[str, Dict[str, Any]]:
        """Extract all characters (living and dead) as a dict keyed by character ID."""
        if self._characters_cache is not None:
            return self._characters_cache

        characters = {}

        # Living characters
        living = self._get_section("living") or {}
        if isinstance(living, dict):
            for char_id, char_data in living.items():
                if isinstance(char_data, dict):
                    characters[str(char_id)] = self._extract_character(char_id, char_data, alive=True)

        # Dead characters
        dead = self._get_section("dead_unpruned") or {}
        if isinstance(dead, dict):
            for char_id, char_data in dead.items():
                if isinstance(char_data, dict):
                    characters[str(char_id)] = self._extract_character(char_id, char_data, alive=False)

        # Also check for characters in character_database or similar keys
        char_db = self._get_section("character_database") or {}
        if isinstance(char_db, dict):
            for char_id, char_data in char_db.items():
                if isinstance(char_data, dict) and str(char_id) not in characters:
                    characters[str(char_id)] = self._extract_character(char_id, char_data, alive=None)

        self._characters_cache = characters
        return characters

    def _extract_character(self, char_id: Any, data: Dict[str, Any], alive: Optional[bool]) -> Dict[str, Any]:
        """Extract a single character's data into a clean dict."""
        # Skills
        skills_raw = data.get("skill", [])
        if isinstance(skills_raw, list):
            skills = {SKILL_NAMES[i]: skills_raw[i] for i in range(min(len(skills_raw), len(SKILL_NAMES)))}
        else:
            skills = {}

        # Traits
        traits_raw = _ensure_list(data.get("traits", []))
        traits = [resolve_trait(t) for t in traits_raw]

        # Spouses
        spouses = _ensure_list(data.get("spouse", data.get("former_spouses", [])))
        if not spouses:
            spouses = _ensure_list(data.get("former_spouses", []))
            current_spouse = data.get("spouse")
            if current_spouse is not None:
                spouses = _ensure_list(current_spouse) + [s for s in spouses if s != current_spouse]

        # Children
        children = _ensure_list(data.get("child", []))

        # Parents
        parents = []
        real_father = data.get("real_father", data.get("father"))
        mother = data.get("mother")
        if real_father is not None:
            parents.append({"role": "father", "id": str(real_father)})
        if mother is not None:
            parents.append({"role": "mother", "id": str(mother)})

        # Titles held
        domain = data.get("domain", data.get("landed_data", {}))
        titles_held = []
        if isinstance(domain, dict):
            domain_list = domain.get("domain", [])
            titles_held = _ensure_list(domain_list)
        elif isinstance(domain, list):
            titles_held = domain

        # Claims
        claims = _ensure_list(data.get("claim", []))
        claim_list = []
        for c in claims:
            if isinstance(c, dict):
                claim_list.append(c.get("title", str(c)))
            else:
                claim_list.append(str(c))

        # Dynasty
        dynasty_id = data.get("dynasty_house", data.get("dynasty"))

        # Cause of death
        death_reason = data.get("death_reason") or data.get("reason")
        killer = data.get("killer")

        char = {
            "id": str(char_id),
            "first_name": data.get("first_name", "Unknown"),
            "birth_name": data.get("birth_name"),
            "nickname": data.get("nickname"),
            "birth_date": _get_date(data.get("birth")),
            "death_date": _get_date(data.get("death")),
            "alive": alive if alive is not None else (data.get("death") is None),
            "female": data.get("female", False),
            "sexuality": data.get("sexuality"),
            "culture": data.get("culture"),
            "faith": data.get("faith", data.get("religion")),
            "dynasty_house": str(dynasty_id) if dynasty_id else None,
            "skills": skills,
            "traits": traits,
            "spouses": [str(s) for s in spouses if s],
            "children": [str(c) for c in children if c],
            "parents": parents,
            "titles_held": [str(t) for t in titles_held if t],
            "claims": claim_list,
            "gold": data.get("gold"),
            "piety": data.get("piety") or data.get("accumulated_piety"),
            "prestige": data.get("prestige") or data.get("accumulated_prestige"),
            "dread": data.get("dread"),
            "stress": data.get("stress"),
            "death_reason": death_reason,
            "killer_id": str(killer) if killer else None,
            "ai": data.get("ai") is not None or data.get("is_ai", False),
        }

        # Landed data (if present as a sub-object)
        landed = data.get("landed_data")
        if isinstance(landed, dict):
            char["realm_capital"] = landed.get("realm_capital")
            char["government"] = landed.get("government")
            char["succession_laws"] = _ensure_list(landed.get("succession", []))
            domain_data = landed.get("domain", [])
            if isinstance(domain_data, list) and not char["titles_held"]:
                char["titles_held"] = [str(t) for t in domain_data]

        return char

    def get_dynasties(self) -> Dict[str, Dict[str, Any]]:
        """Extract dynasty information."""
        dynasties = {}

        # Dynasty houses
        dynasty_house = self._get_section("dynasties", "dynasty_house") or {}
        if isinstance(dynasty_house, dict):
            for house_id, house_data in dynasty_house.items():
                if isinstance(house_data, dict):
                    dynasties[str(house_id)] = {
                        "id": str(house_id),
                        "name": house_data.get("name", f"House {house_id}"),
                        "dynasty": str(house_data.get("dynasty", "")),
                        "head": str(house_data.get("head_of_house", "")) if house_data.get("head_of_house") else None,
                        "motto": house_data.get("motto"),
                        "found_date": _get_date(house_data.get("found_date")),
                        "founder": str(house_data.get("founder", "")) if house_data.get("founder") else None,
                    }

        # Top-level dynasties
        dynasty_top = self._get_section("dynasties", "dynasties") or {}
        if isinstance(dynasty_top, dict):
            for dyn_id, dyn_data in dynasty_top.items():
                if isinstance(dyn_data, dict):
                    key = f"dynasty_{dyn_id}"
                    dynasties[key] = {
                        "id": str(dyn_id),
                        "type": "dynasty",
                        "name": dyn_data.get("name", f"Dynasty {dyn_id}"),
                        "prestige": dyn_data.get("prestige"),
                        "head": str(dyn_data.get("head", "")) if dyn_data.get("head") else None,
                        "found_date": _get_date(dyn_data.get("found_date")),
                        "founder": str(dyn_data.get("founder", "")) if dyn_data.get("founder") else None,
                    }

        return dynasties

    def get_wars(self) -> List[Dict[str, Any]]:
        """Extract war data."""
        wars_section = self._get_section("wars") or self._get_section("active_wars") or {}
        wars = []

        if isinstance(wars_section, dict):
            for war_id, war_data in wars_section.items():
                if isinstance(war_data, dict):
                    wars.append(self._extract_war(war_id, war_data))
        elif isinstance(wars_section, list):
            for i, war_data in enumerate(wars_section):
                if isinstance(war_data, dict):
                    wars.append(self._extract_war(i, war_data))

        # Also check for previous wars
        prev_wars = self._get_section("previous_wars") or {}
        if isinstance(prev_wars, dict):
            for war_id, war_data in prev_wars.items():
                if isinstance(war_data, dict):
                    w = self._extract_war(war_id, war_data)
                    w["concluded"] = True
                    wars.append(w)
        elif isinstance(prev_wars, list):
            for i, war_data in enumerate(prev_wars):
                if isinstance(war_data, dict):
                    w = self._extract_war(f"prev_{i}", war_data)
                    w["concluded"] = True
                    wars.append(w)

        return wars

    def _extract_war(self, war_id: Any, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract a single war's data."""
        # Attackers and defenders
        attackers = _ensure_list(data.get("attacker", []))
        defenders = _ensure_list(data.get("defender", []))

        # Handle nested attacker/defender structures
        attacker_ids = []
        defender_ids = []
        for a in attackers:
            if isinstance(a, dict):
                attacker_ids.append(str(a.get("character", a)))
            else:
                attacker_ids.append(str(a))
        for d in defenders:
            if isinstance(d, dict):
                defender_ids.append(str(d.get("character", d)))
            else:
                defender_ids.append(str(d))

        # War leader shortcuts
        if not attacker_ids:
            primary_att = data.get("primary_attacker")
            if primary_att:
                attacker_ids = [str(primary_att)]
        if not defender_ids:
            primary_def = data.get("primary_defender")
            if primary_def:
                defender_ids = [str(primary_def)]

        return {
            "id": str(war_id),
            "name": data.get("name", f"War {war_id}"),
            "casus_belli": data.get("casus_belli", data.get("cb", "Unknown")),
            "start_date": _get_date(data.get("start_date")),
            "end_date": _get_date(data.get("end_date")),
            "attacker_war_score": data.get("attacker_score", data.get("attacker_war_score")),
            "defender_war_score": data.get("defender_score", data.get("defender_war_score")),
            "result": data.get("result"),
            "primary_attacker": str(data.get("primary_attacker", "")) if data.get("primary_attacker") else None,
            "primary_defender": str(data.get("primary_defender", "")) if data.get("primary_defender") else None,
            "attacker_ids": attacker_ids,
            "defender_ids": defender_ids,
            "target_title": data.get("target_title", data.get("targeted_titles", data.get("title"))),
            "concluded": data.get("concluded", False),
            "battles": self._extract_battles(data),
        }

    def _extract_battles(self, war_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract battle data from a war."""
        battles_raw = war_data.get("history", war_data.get("battles", {}))
        battles = []

        if isinstance(battles_raw, dict):
            for date_or_id, battle_data in battles_raw.items():
                if isinstance(battle_data, dict) and ("location" in battle_data or "attacker" in battle_data):
                    battles.append({
                        "date": str(date_or_id),
                        "location": battle_data.get("location"),
                        "attacker_commander": str(battle_data.get("attacker", {}).get("commander", "")) if isinstance(battle_data.get("attacker"), dict) else None,
                        "defender_commander": str(battle_data.get("defender", {}).get("commander", "")) if isinstance(battle_data.get("defender"), dict) else None,
                        "attacker_losses": battle_data.get("attacker", {}).get("losses") if isinstance(battle_data.get("attacker"), dict) else None,
                        "defender_losses": battle_data.get("defender", {}).get("losses") if isinstance(battle_data.get("defender"), dict) else None,
                        "result": battle_data.get("result"),
                    })
        return battles

    def get_titles(self) -> Dict[str, Dict[str, Any]]:
        """Extract landed title data (kingdoms, empires, duchies, etc.)."""
        titles = {}

        landed_titles = self._get_section("landed_titles", "landed_titles") or {}
        if not isinstance(landed_titles, dict):
            landed_titles = self._get_section("landed_titles") or {}

        if isinstance(landed_titles, dict):
            for title_key, title_data in landed_titles.items():
                if isinstance(title_data, dict):
                    titles[str(title_key)] = self._extract_title(title_key, title_data)

        return titles

    def _extract_title(self, title_key: Any, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract a single title's data."""
        # Determine tier from key prefix
        key_str = str(data.get("key", title_key))
        tier = "unknown"
        if key_str.startswith("e_"):
            tier = "empire"
        elif key_str.startswith("k_"):
            tier = "kingdom"
        elif key_str.startswith("d_"):
            tier = "duchy"
        elif key_str.startswith("c_"):
            tier = "county"
        elif key_str.startswith("b_"):
            tier = "barony"

        holder = data.get("holder", data.get("de_jure_holder"))

        # History of holders
        history = []
        hist_data = data.get("history", {})
        if isinstance(hist_data, dict):
            for date_key, event in hist_data.items():
                if isinstance(event, dict):
                    history.append({
                        "date": str(date_key),
                        "holder": str(event.get("holder", "")) if event.get("holder") else None,
                        "type": event.get("type"),
                    })

        # De jure vassals / sub-titles
        de_jure_vassals = _ensure_list(data.get("de_jure_vassals", []))

        return {
            "id": str(title_key),
            "key": key_str,
            "name": data.get("name", key_str),
            "tier": tier,
            "holder": str(holder) if holder else None,
            "de_jure_liege": str(data.get("de_jure_liege", "")) if data.get("de_jure_liege") else None,
            "de_facto_liege": str(data.get("de_facto_liege", "")) if data.get("de_facto_liege") else None,
            "capital": data.get("capital"),
            "color": data.get("color"),
            "de_jure_vassals": [str(v) for v in de_jure_vassals],
            "history": history,
            "laws": _ensure_list(data.get("laws", [])),
            "succession": data.get("succession"),
        }

    def get_player_character_id(self) -> Optional[str]:
        """Get the player's character ID."""
        played = self._get_section("played_character") or {}
        if isinstance(played, dict):
            # Could be a list of played characters or a single one
            char_id = played.get("character")
            if char_id is not None:
                return str(char_id)

            # Try first entry
            for key, val in played.items():
                if isinstance(val, dict) and "character" in val:
                    return str(val["character"])
                elif isinstance(val, (int, str)):
                    return str(val)

        # Try other common locations
        player = self._get_section("player") or self._get_section("currently_played")
        if player is not None:
            if isinstance(player, dict):
                return str(player.get("character", player.get("id", "")))
            return str(player)

        return None

    def extract_all(self) -> Dict[str, Any]:
        """Extract all entities into a single structured dict."""
        meta = self.get_meta()
        player_id = self.get_player_character_id()
        characters = self.get_all_characters()
        dynasties = self.get_dynasties()
        wars = self.get_wars()
        titles = self.get_titles()

        # Build neighbor information for the player's realm
        neighbors = []
        if player_id and player_id in characters:
            player = characters[player_id]
            player_titles = set(player.get("titles_held", []))
            # Find titles at kingdom/empire level held by other characters
            for title_id, title in titles.items():
                if title["tier"] in ("kingdom", "empire") and title.get("holder"):
                    holder_id = title["holder"]
                    if holder_id != player_id and holder_id in characters:
                        neighbors.append({
                            "title_id": title_id,
                            "title_name": title["name"],
                            "tier": title["tier"],
                            "holder_id": holder_id,
                            "holder_name": characters[holder_id].get("first_name", "Unknown"),
                        })

        return {
            "meta": meta,
            "player_id": player_id,
            "characters": characters,
            "dynasties": dynasties,
            "wars": wars,
            "titles": titles,
            "neighbors": neighbors,
            "stats": {
                "total_characters": len(characters),
                "living_characters": sum(1 for c in characters.values() if c.get("alive")),
                "dead_characters": sum(1 for c in characters.values() if not c.get("alive")),
                "total_wars": len(wars),
                "active_wars": sum(1 for w in wars if not w.get("concluded")),
                "total_titles": len(titles),
                "total_dynasties": len(dynasties),
            },
        }
