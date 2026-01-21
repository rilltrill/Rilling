use std::collections::HashSet;

use jomini::common::{Date, PdsDate};

use super::{
    super::{
        super::game_data::{GameData, Localizable, LocalizationError, Localize},
        game_state::GameState,
        parser::{
            types::{GameString, Shared, Wrapper, WrapperMut},
            GameObjectMap, GameObjectMapping, ParsingError, SaveFileValue,
        },
    },
    Artifact, Culture, EntityRef, Faith, Finalize, FromGameObject, GameObjectDerived,
    GameObjectEntity, GameRef, House, Memory, Title,
};

/// An enum that holds either a character or a reference to a character.
/// Effectively either a vassal([Character]) or a vassal contract.
/// This is done so that we can hold a reference to a vassal contract, and also manually added characters from vassals registering themselves via [Character::add_vassal].
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize), serde(untagged))]
enum Vassal {
    Character(Shared<GameObjectEntity<Character>>),
    Reference(Shared<Option<Shared<GameObjectEntity<Character>>>>),
}

// MAYBE enum for dead and alive character?

/// Represents a character in the game.
#[derive(Clone)]
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Character {
    name: GameString,
    nick: Option<GameString>,
    birth: Date,
    dead: bool,
    date: Option<Date>,
    reason: Option<GameString>,
    faith: Option<GameRef<Faith>>,
    culture: Option<GameRef<Culture>>,
    house: Option<GameRef<House>>,
    skills: Vec<i8>,
    traits: Vec<GameString>,
    spouses: HashSet<GameRef<Character>>,
    former: Vec<GameRef<Character>>,
    children: Vec<GameRef<Character>>,
    parents: Vec<GameRef<Character>>,
    dna: Option<GameString>,
    memories: Vec<GameRef<Memory>>,
    titles: Vec<GameRef<Title>>,
    gold: f32,
    piety: f32,
    prestige: f32,
    dread: f32,
    strength: f32,
    kills: Vec<GameRef<Character>>,
    languages: Vec<GameString>,
    vassals: Vec<Vassal>,
    liege: Option<GameRef<Character>>,
    female: bool,
    artifacts: Vec<GameRef<Artifact>>,
    pub narrative: Vec<String>,
}

// So both faith and culture can be stored for a character in the latest leader of their house.
// The problem with reading that now is that while Houses are already likely loaded,
// the characters that the houses hold reference to are likely still dummy, so we can't read the faith and culture from the house leader.
// So we will be returning None for now in case either is missing, but later during serialization read the one from house.

/// Processes a currency node of the character
fn process_currency(currency_node: Option<&SaveFileValue>) -> Result<f32, ParsingError> {
    if let Some(o) = currency_node {
        if let Some(currency) = o.as_object()?.as_map()?.get("accumulated") {
            return Ok(currency.as_real()? as f32);
        } else {
            return Ok(0.0);
        }
    } else {
        return Ok(0.0);
    }
}

impl Character {
    /// Gets whether the character is female
    pub fn get_female(&self) -> bool {
        self.female
    }

    pub fn get_faith(&self) -> Option<GameRef<Faith>> {
        self.faith.clone()
    }

    pub fn get_culture(&self) -> Option<GameRef<Culture>> {
        self.culture.clone()
    }

    /// Adds a character as a parent of this character
    pub fn register_parent(&mut self, parent: GameRef<Character>) {
        self.parents.push(parent);
    }

    /// Gets the death date string of the character
    pub fn get_death_date(&self) -> Option<Date> {
        self.date.clone()
    }

    /// Adds a character as a vassal of this character
    pub fn add_vassal(&mut self, vassal: GameRef<Character>) {
        self.vassals.push(Vassal::Character(vassal));
    }

    pub fn set_liege(&mut self, liege: GameRef<Character>) {
        self.liege = Some(liege);
    }

    /// Gets the children of this character
    pub fn get_children(&self) -> &Vec<GameRef<Character>> {
        &self.children
    }

    /// Gets all of the held de jure barony keys of the character and their vassals
    pub fn get_barony_keys(&self, de_jure: bool) -> Vec<GameString> {
        let mut provinces = Vec::new();
        for title in self.titles.iter() {
            if let Some(title) = title.get_internal().inner() {
                let key = title.get_key();
                if key.starts_with("e_") || key.starts_with("k_") {
                    //for kingdoms and empires we don't want to add the de jure baronies
                    continue;
                } else {
                    if de_jure {
                        provinces.append(&mut title.get_de_jure_barony_keys());
                    } else {
                        provinces.append(&mut title.get_barony_keys());
                    }
                }
            }
        }
        for vassal in self.vassals.iter() {
            match vassal {
                Vassal::Character(c) => {
                    if let Some(c) = c.get_internal().inner() {
                        provinces.append(&mut c.get_barony_keys(de_jure));
                    }
                }
                Vassal::Reference(c) => {
                    if let Some(c) = c.get_internal().as_ref() {
                        if let Some(c) = c.get_internal().inner() {
                            provinces.append(&mut c.get_barony_keys(de_jure))
                        }
                    }
                }
            }
        }
        return provinces;
    }

    /// Gets the descendants of the character
    pub fn get_descendants(&self) -> Vec<GameRef<Character>> {
        let mut res = Vec::new();
        let mut stack: Vec<GameRef<Character>> = Vec::new();
        for child in self.children.iter() {
            stack.push(child.clone());
            res.push(child.clone());
        }
        while let Some(c) = stack.pop() {
            if let Some(c) = c.get_internal().inner() {
                for child in c.children.iter() {
                    stack.push(child.clone());
                    res.push(child.clone());
                }
            }
        }
        return res;
    }

    /// Gets the dynasty of the character
    pub fn get_house(&self) -> Option<GameRef<House>> {
        if let Some(house) = &self.house {
            return Some(house.clone());
        } else {
            return None;
        }
    }

    /// Generates a narrative life story for the character (1-5 paragraphs)
    pub fn generate_narrative(&self) -> Vec<String> {
        let mut paragraphs = Vec::new();

        let pronoun = if self.female { "She" } else { "He" };
        let possessive = if self.female { "her" } else { "his" };
        let objective = if self.female { "her" } else { "him" };

        // Collect all data upfront to avoid RefCell borrow issues
        let culture_name = self.culture.as_ref()
            .and_then(|c| c.get_internal().inner().map(|x| x.get_name().to_string()));

        let faith_name = self.faith.as_ref()
            .and_then(|f| f.get_internal().inner().map(|x| x.get_name().to_string()));

        let house_name = self.house.as_ref()
            .and_then(|h| h.get_internal().inner().map(|x| x.get_name().to_string()));

        let parent_names: Vec<String> = self.parents.iter()
            .filter_map(|p| p.get_internal().inner().map(|c| c.get_name().to_string()))
            .collect();

        let title_names: Vec<String> = self.titles.iter()
            .filter_map(|t| t.get_internal().inner().map(|title| title.get_name().to_string()))
            .collect();

        let liege_name = self.liege.as_ref()
            .and_then(|l| l.get_internal().inner().map(|x| x.get_name().to_string()));

        let child_names: Vec<String> = self.children.iter()
            .filter_map(|c| c.get_internal().inner().map(|ch| ch.get_name().to_string()))
            .take(5)
            .collect();

        let child_count = self.children.len();

        // Collect spouse information and detect incestuous relationships
        let all_spouses: Vec<_> = self.spouses.iter()
            .chain(self.former.iter())
            .collect();

        let mut spouse_info: Vec<(String, Option<String>)> = Vec::new();

        for spouse_ref in &all_spouses {
            if let Some(spouse) = spouse_ref.get_internal().inner() {
                let spouse_name = spouse.get_name().to_string();
                let mut relationship = None;

                // Check for incestuous relationships
                // Check if spouse is a child
                if self.children.iter().any(|c| {
                    c.get_internal().inner().map(|ch| ch.get_name().to_string()) == Some(spouse_name.clone())
                }) {
                    relationship = Some(format!("{} own child", possessive));
                }
                // Check if spouse is a parent
                else if self.parents.iter().any(|p| {
                    p.get_internal().inner().map(|pa| pa.get_name().to_string()) == Some(spouse_name.clone())
                }) {
                    relationship = Some(format!("{} own parent", possessive));
                }
                // Check if spouse is a grandchild
                else if self.children.iter().any(|child_ref| {
                    if let Some(child) = child_ref.get_internal().inner() {
                        child.get_children().iter().any(|grandchild_ref| {
                            grandchild_ref.get_internal().inner()
                                .map(|gc| gc.get_name().to_string()) == Some(spouse_name.clone())
                        })
                    } else {
                        false
                    }
                }) {
                    relationship = Some(format!("{} own grandchild", possessive));
                }
                // Check if spouse is a sibling
                else if !self.parents.is_empty() && self.parents.iter().any(|parent_ref| {
                    if let Some(parent) = parent_ref.get_internal().inner() {
                        parent.get_children().iter().any(|sibling_ref| {
                            if let Some(sibling) = sibling_ref.get_internal().inner() {
                                sibling.get_name().to_string() == spouse_name &&
                                sibling.get_name().to_string() != self.name.to_string()
                            } else {
                                false
                            }
                        })
                    } else {
                        false
                    }
                }) {
                    relationship = Some(format!("{} own sibling", possessive));
                }

                spouse_info.push((spouse_name, relationship));
            }
        }

        // Paragraph 1: Birth and Origins
        let mut origin = format!("{} was born on {}", self.name.as_ref(), self.birth.iso_8601());

        if let Some(ref culture) = culture_name {
            origin.push_str(&format!(", into the {} culture", culture));
        }

        if let Some(ref faith) = faith_name {
            origin.push_str(&format!(", adhering to the {} faith", faith));
        }

        if let Some(ref house) = house_name {
            origin.push_str(&format!(". {} belonged to the distinguished house of {}", pronoun, house));
        } else {
            origin.push_str(". Despite {} lowborn origins".to_string().replace("{}", possessive).as_str());
        }

        if !parent_names.is_empty() {
            origin.push_str(&format!(", the {} of {}",
                if self.female { "daughter" } else { "son" },
                parent_names.join(" and ")));
        }

        origin.push('.');
        paragraphs.push(origin);

        // Paragraph 2: Personality and Traits
        if !self.traits.is_empty() || self.skills.len() >= 6 {
            let mut personality = format!("{} was ", self.name.as_ref());

            let trait_count = self.traits.len().min(8);
            if trait_count > 0 {
                let traits_str: Vec<String> = self.traits.iter()
                    .take(trait_count)
                    .map(|t| {
                        let trait_str = t.to_string().to_lowercase();
                        // Add articles for traits
                        if trait_str.starts_with(|c: char| "aeiou".contains(c)) {
                            format!("an {}", trait_str)
                        } else {
                            format!("a {}", trait_str)
                        }
                    })
                    .collect();

                personality.push_str("renowned as ");
                if traits_str.len() == 1 {
                    personality.push_str(&traits_str[0]);
                } else if traits_str.len() == 2 {
                    personality.push_str(&format!("{} and {}", traits_str[0], traits_str[1]));
                } else {
                    let last = &traits_str[traits_str.len()-1];
                    let rest = &traits_str[..traits_str.len()-1];
                    personality.push_str(&format!("{}, and {}", rest.join(", "), last));
                }
                personality.push_str(" individual");
            }

            if self.skills.len() >= 6 {
                let skill_names = ["diplomacy", "martial prowess", "stewardship",
                                   "intrigue", "learning", "prowess"];
                let mut notable_skills: Vec<(usize, i8)> = self.skills.iter().enumerate()
                    .filter(|(_, &val)| val > 12)
                    .map(|(idx, &val)| (idx, val))
                    .collect();
                notable_skills.sort_by_key(|(_, val)| -val);

                if !notable_skills.is_empty() {
                    if trait_count > 0 {
                        personality.push_str(". ");
                    }
                    personality.push_str(&format!("{} demonstrated exceptional skill in ", pronoun));
                    let skill_strs: Vec<String> = notable_skills.iter()
                        .take(3)
                        .map(|(idx, _)| skill_names[*idx].to_string())
                        .collect();
                    if skill_strs.len() == 1 {
                        personality.push_str(&skill_strs[0]);
                    } else {
                        personality.push_str(&format!("{} and {}",
                            skill_strs[..skill_strs.len()-1].join(", "),
                            skill_strs[skill_strs.len()-1]));
                    }
                }
            }

            personality.push('.');
            paragraphs.push(personality);
        }

        // Paragraph 3: Political Career
        if !title_names.is_empty() {
            let mut political = format!("During {} reign, {} ruled ", possessive, self.name.as_ref());

            if title_names.len() == 1 {
                political.push_str(&format!("as {}", title_names[0]));
            } else if title_names.len() == 2 {
                political.push_str(&format!("as {} and {}", title_names[0], title_names[1]));
            } else {
                political.push_str(&format!("over {} titles, most notably as {} and {}",
                    title_names.len(), title_names[0], title_names[1]));
            }

            if let Some(ref liege) = liege_name {
                political.push_str(&format!(", serving as a vassal under {}", liege));
            }

            // Add achievements based on stats
            let mut achievements = Vec::new();
            if self.prestige > 2000.0 {
                achievements.push(format!("{} accumulated immense prestige throughout {} rule", pronoun, possessive));
            } else if self.prestige > 1000.0 {
                achievements.push(format!("{} gained considerable prestige", pronoun));
            }

            if self.gold > 1000.0 {
                achievements.push(format!("amassed great wealth"));
            }

            if self.dread > 80.0 {
                achievements.push(format!("ruled through terror and intimidation, commanding absolute fear from {} subjects", possessive));
            } else if self.dread > 50.0 {
                achievements.push(format!("maintained order through fear and force"));
            }

            if self.piety > 2000.0 {
                achievements.push(format!("was renowned for {} exceptional piety and devotion", possessive));
            } else if self.piety > 1000.0 {
                achievements.push(format!("gained recognition for {} religious devotion", possessive));
            }

            if !achievements.is_empty() {
                political.push_str(". ");
                political.push_str(&achievements.join(", and "));
            }

            political.push('.');
            paragraphs.push(political);
        }

        // Paragraph 4: Family and Personal Life (including scandalous relationships)
        if !spouse_info.is_empty() || child_count > 0 {
            let mut family = String::new();

            // Handle marriages and relationships
            if !spouse_info.is_empty() {
                let scandalous: Vec<_> = spouse_info.iter()
                    .filter(|(_, rel)| rel.is_some())
                    .collect();
                let normal: Vec<_> = spouse_info.iter()
                    .filter(|(_, rel)| rel.is_none())
                    .collect();

                if !normal.is_empty() {
                    if normal.len() == 1 {
                        family.push_str(&format!("{} married {}", self.name.as_ref(), normal[0].0));
                    } else {
                        family.push_str(&format!("{} married {} times", self.name.as_ref(), normal.len()));
                    }
                }

                // Add scandalous relationships with disdain
                if !scandalous.is_empty() {
                    if !normal.is_empty() {
                        family.push_str(". ");
                    }

                    for (i, (spouse_name, relationship)) in scandalous.iter().enumerate() {
                        if i == 0 {
                            family.push_str(&format!("Controversially, {} took {} as {} lover",
                                pronoun.to_lowercase(), spouse_name, possessive));
                            if let Some(rel) = relationship {
                                family.push_str(&format!("—{}", rel));
                            }
                        } else {
                            family.push_str(&format!(", and later {}", spouse_name));
                            if let Some(rel) = relationship {
                                family.push_str(&format!(", {}", rel));
                            }
                        }
                    }

                    family.push_str("—a transgression that scandalized contemporaries and violated established moral and religious norms");
                }
            }

            if child_count > 0 {
                if !family.is_empty() {
                    family.push_str(". ");
                }

                family.push_str(&format!("{} {} {} ",
                    self.name.as_ref(),
                    if self.dead { "left behind" } else { "has" },
                    child_count));

                if child_count == 1 {
                    family.push_str("child");
                    if !child_names.is_empty() {
                        family.push_str(&format!(", {}", child_names[0]));
                    }
                } else {
                    family.push_str("children");
                    if !child_names.is_empty() {
                        family.push_str(&format!(", including {}", child_names.join(", ")));
                    }
                }

                if child_count > 10 {
                    family.push_str(&format!(", establishing a substantial dynastic legacy through {} numerous descendants", possessive));
                }
            }

            if !family.is_empty() {
                family.push('.');
                paragraphs.push(family);
            }
        }

        // Paragraph 5: Military Achievements and Possessions
        let mut achievements = String::new();
        let mut has_achievements = false;

        let kill_count = self.kills.len();
        if kill_count > 5 {
            achievements.push_str(&format!("A formidable warrior, {} personally slew {} enemies in combat",
                self.name.as_ref(), kill_count));
            has_achievements = true;
        } else if kill_count > 0 {
            achievements.push_str(&format!("{} claimed {} {} in personal combat",
                self.name.as_ref(), kill_count, if kill_count == 1 { "life" } else { "lives" }));
            has_achievements = true;
        }

        if self.artifacts.len() > 3 {
            if has_achievements {
                achievements.push_str(&format!(". {} also amassed ", pronoun));
            } else {
                achievements.push_str(&format!("{} possessed ", self.name.as_ref()));
            }
            achievements.push_str(&format!("a notable collection of {} artifacts",
                self.artifacts.len()));
            has_achievements = true;
        } else if !self.artifacts.is_empty() {
            if has_achievements {
                achievements.push_str(&format!(", and possessed {} notable {}",
                    self.artifacts.len(),
                    if self.artifacts.len() == 1 { "artifact" } else { "artifacts" }));
            } else {
                achievements.push_str(&format!("{} possessed {} notable {}",
                    self.name.as_ref(),
                    self.artifacts.len(),
                    if self.artifacts.len() == 1 { "artifact" } else { "artifacts" }));
                has_achievements = true;
            }
        }

        if self.memories.len() > 5 {
            if has_achievements {
                achievements.push_str(&format!(". Throughout {} lifetime, ", possessive));
            } else {
                achievements.push_str(&format!("Throughout {} lifetime, ", possessive));
            }
            achievements.push_str(&format!("{} experienced {} significant events that defined {} legacy",
                self.name.as_ref(), self.memories.len(), possessive));
            has_achievements = true;
        }

        if self.languages.len() > 2 {
            if has_achievements {
                achievements.push_str(&format!(". A polyglot, {} was fluent in {} languages",
                    pronoun.to_lowercase(), self.languages.len()));
            } else {
                achievements.push_str(&format!("{} was a polyglot, fluent in {} languages",
                    self.name.as_ref(), self.languages.len()));
                has_achievements = true;
            }
        } else if self.languages.len() == 2 {
            if has_achievements {
                achievements.push_str(&format!(". {} was also bilingual", pronoun));
            } else {
                achievements.push_str(&format!("{} was bilingual", self.name.as_ref()));
                has_achievements = true;
            }
        }

        if has_achievements {
            achievements.push('.');
            paragraphs.push(achievements);
        }

        // Death paragraph
        if self.dead {
            let mut death = String::new();

            if let Some(ref death_date) = self.date {
                let age = death_date.year() - self.birth.year();

                death.push_str(&format!("{} met {} end on {}", self.name.as_ref(), possessive, death_date.iso_8601()));

                if let Some(ref reason) = self.reason {
                    let reason_str = reason.as_ref().to_lowercase();
                    if reason_str.contains("murder") || reason_str.contains("execution") {
                        death.push_str(&format!(", {}", reason.as_ref()));
                    } else {
                        death.push_str(&format!(", dying of {}", reason.as_ref()));
                    }
                }

                death.push_str(&format!(", at the age of {}", age));

                if age > 70 {
                    death.push_str(&format!(", having lived a remarkably long life for the era"));
                } else if age < 30 {
                    death.push_str(&format!(", cut down in {} youth", possessive));
                }
            } else {
                death.push_str(&format!("{} passed away", self.name.as_ref()));
            }

            if child_count > 15 {
                death.push_str(&format!(". {} prolific legacy endured through {} many descendants",
                    possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..],
                    possessive));
            } else if child_count > 5 {
                death.push_str(&format!(". {} legacy continued through {} {} children",
                    possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..],
                    possessive, child_count));
            } else if child_count > 0 {
                death.push_str(&format!(", leaving behind {} to carry on {} lineage",
                    if child_count == 1 { "an heir" } else { "heirs" },
                    possessive));
            }

            death.push('.');
            paragraphs.push(death);
        }

        if !paragraphs.is_empty() {
            eprintln!("Generated {} paragraph narrative for {}", paragraphs.len(), self.name.as_ref());
        }
        paragraphs
    }

    /// Sets the narrative for this character
    pub fn set_narrative(&mut self, narrative: Vec<String>) {
        self.narrative = narrative;
    }
}

impl FromGameObject for Character {
    fn from_game_object(
        base: &GameObjectMap,
        game_state: &mut GameState,
    ) -> Result<Self, ParsingError> {
        let mut val = Self {
            // a few simple keys
            female: base
                .get("female")
                .map_or(Ok(false), |val| val.as_boolean())?,
            name: base.get_string("first_name")?,
            birth: base.get_date("birth")?,
            // non mandatory, yet simple keys
            nick: base
                .get("nickname_text")
                .or(base.get("nickname"))
                .map(|x| x.as_string())
                .transpose()?,
            faith: base
                .get("faith")
                .map(|x| x.as_id().and_then(|id| Ok(game_state.get_faith(&id))))
                .transpose()?,
            culture: base
                .get("culture")
                .map(|x| x.as_id().and_then(|id| Ok(game_state.get_culture(&id))))
                .transpose()?,
            dna: base.get("dna").map(|x| x.as_string()).transpose()?,
            traits: Vec::new(),
            skills: Vec::new(),
            // keys grouped together in sections, we resolve these later
            dead: false,
            date: None,
            reason: None,
            house: None,
            spouses: HashSet::new(),
            former: Vec::new(),
            children: Vec::new(),
            parents: Vec::new(),
            memories: Vec::new(),
            titles: Vec::new(),
            gold: 0.0,
            piety: 0.0,
            prestige: 0.0,
            dread: 0.0,
            strength: 0.0,
            kills: Vec::new(),
            languages: Vec::new(),
            vassals: Vec::new(),
            liege: None,
            artifacts: Vec::new(),
            narrative: Vec::new(),
        };
        for s in base.get_object("skill")?.as_array()?.into_iter() {
            val.skills.push(s.as_integer()? as i8);
        }
        if let Some(traits_node) = base.get("traits") {
            for t in traits_node.as_object()?.as_array()? {
                let integer = t.as_integer()?;
                if integer >= 0 {
                    // WTF? a negative index? ok schizo save file go back to bed
                    val.traits.push(game_state.get_trait(integer as u16));
                }
            }
        }
        if let Some(dynasty_id) = base.get("dynasty_house") {
            val.house = Some(game_state.get_house(&dynasty_id.as_id()?));
        }
        if let Some(landed_data_node) = base.get("landed_data") {
            let landed_data = landed_data_node.as_object()?.as_map()?;
            if let Some(dread_node) = landed_data.get("dread") {
                val.dread = dread_node.as_real()? as f32;
            }
            if let Some(strength_node) = landed_data.get("strength") {
                val.strength = strength_node.as_real()? as f32;
            }
            if let Some(titles_node) = landed_data.get("domain") {
                for t in titles_node.as_object()?.as_array()? {
                    val.titles.push(game_state.get_title(&t.as_id()?));
                }
            }
            if let Some(vassals_node) = landed_data.get("vassal_contracts") {
                for v in vassals_node.as_object()?.as_array()? {
                    val.vassals
                        .push(Vassal::Reference(game_state.get_vassal(&v.as_id()?)));
                }
            }
        }
        if let Some(dead_data) = base.get("dead_data") {
            val.dead = true;
            let o = dead_data.as_object()?.as_map()?;
            if let Some(reason_node) = o.get("reason") {
                val.reason = Some(reason_node.as_string()?);
            }
            if let Some(domain_node) = o.get("domain") {
                for t in domain_node.as_object()?.as_array()? {
                    val.titles.push(game_state.get_title(&t.as_id()?));
                }
            }
            val.date = Some(o.get_date("date")?);
            if let Some(liege_node) = o.get("liege") {
                val.liege = Some(game_state.get_character(&liege_node.as_id()?));
            }
            if let Some(memory_node) = o.get("memories") {
                for m in memory_node.as_object()?.as_array()? {
                    val.memories
                        .push(game_state.get_memory(&m.as_id()?).clone());
                }
            }
        } else if let Some(alive_data) = base.get("alive_data") {
            val.dead = false;
            let alive_data = alive_data.as_object()?.as_map()?;
            val.piety = process_currency(alive_data.get("piety"))?;
            val.prestige = process_currency(alive_data.get("prestige"))?;
            if let Some(kills_node) = alive_data.get("kills") {
                for k in kills_node.as_object()?.as_array()? {
                    val.kills
                        .push(game_state.get_character(&k.as_id()?).clone());
                }
            }
            if let Some(gold_node) = alive_data.get("gold") {
                match gold_node {
                    SaveFileValue::Object(o) => {
                        if let Some(gold_node) = o.as_map()?.get("value") {
                            val.gold = gold_node.as_real()? as f32;
                        }
                    }
                    SaveFileValue::Real(r) => {
                        val.gold = *r as f32;
                    }
                    _ => {}
                }
            }
            for l in alive_data.get_object("languages")?.as_array()? {
                val.languages.push(l.as_string()?);
            }
            if let Some(perk_node) = alive_data.get("perks") {
                for p in perk_node.as_object()?.as_array()? {
                    val.traits.push(p.as_string()?);
                }
            }
            if let Some(memory_node) = alive_data.get("memories") {
                for m in memory_node.as_object()?.as_array()? {
                    val.memories
                        .push(game_state.get_memory(&m.as_id()?).clone());
                }
            }
            if let Some(inventory_node) = alive_data.get("inventory") {
                if let Some(artifacts_node) = inventory_node.as_object()?.as_map()?.get("artifacts")
                {
                    for a in artifacts_node.as_object()?.as_array()? {
                        val.artifacts
                            .push(game_state.get_artifact(&a.as_id()?).clone());
                    }
                }
            }
        }
        if let Some(family_data) = base.get("family_data") {
            let f = family_data.as_object()?;
            if !f.is_empty() {
                let f = f.as_map()?;
                if let Some(former_spouses_node) = f.get("former_spouses") {
                    for s in former_spouses_node.as_object()?.as_array()? {
                        val.former
                            .push(game_state.get_character(&s.as_id()?).clone());
                    }
                }
                if let Some(spouse_node) = f.get("spouse") {
                    if let SaveFileValue::Object(o) = spouse_node {
                        for s in o.as_array()? {
                            let c = game_state.get_character(&s.as_id()?).clone();
                            val.spouses.insert(c);
                        }
                    } else {
                        let c = game_state.get_character(&spouse_node.as_id()?).clone();
                        val.spouses.insert(c);
                    }
                }
                if let Some(primary_spouse_node) = f.get("primary_spouse") {
                    let c = game_state
                        .get_character(&primary_spouse_node.as_id()?)
                        .clone();
                    val.spouses.insert(c);
                }
                if let Some(children_node) = f.get("child") {
                    for s in children_node.as_object()?.as_array()? {
                        val.children
                            .push(game_state.get_character(&s.as_id()?).clone());
                    }
                }
            }
        }
        Ok(val)
    }
}

impl Finalize for GameRef<Character> {
    fn finalize(&mut self) {
        if let Some(char) = self.get_internal_mut().inner_mut() {
            if let Some(liege) = char.liege.clone() {
                if let Ok(mut inner) = liege.try_get_internal_mut() {
                    if let Some(liege) = inner.inner_mut() {
                        liege.add_vassal(self.clone());
                    } else {
                        char.liege = None;
                    }
                }
            }
            for child in char.children.iter() {
                if let Some(child) = child.get_internal_mut().inner_mut() {
                    child.register_parent(self.clone());
                }
            }
            if char.faith.is_none() {
                if let Some(house) = &char.house {
                    if let Some(house) = house.get_internal().inner() {
                        char.faith = house.get_faith();
                    }
                }
            }
            if char.culture.is_none() {
                if let Some(house) = &char.house {
                    if let Some(house) = house.get_internal().inner() {
                        char.culture = house.get_culture();
                    }
                }
            }
            for vassal in char.vassals.iter_mut() {
                match vassal {
                    Vassal::Character(c) => {
                        if let Some(c) = c.get_internal_mut().inner_mut() {
                            c.set_liege(self.clone());
                        }
                    }
                    Vassal::Reference(c) => {
                        if let Some(c) = c.get_internal_mut().as_mut() {
                            if let Some(c) = c.get_internal_mut().inner_mut() {
                                c.set_liege(self.clone());
                            }
                        }
                    }
                }
            }
        }
    }
}

impl GameObjectDerived for Character {
    fn get_name(&self) -> GameString {
        self.name.clone()
    }

    fn get_references<E: From<EntityRef>, C: Extend<E>>(&self, collection: &mut C) {
        if let Some(faith) = &self.faith {
            collection.extend([E::from(faith.clone().into())]);
        }
        if let Some(culture) = &self.culture {
            collection.extend([E::from(culture.clone().into())]);
        }
        if let Some(house) = &self.house {
            collection.extend([E::from(house.clone().into())]);
        }
        if let Some(liege) = &self.liege {
            collection.extend([E::from(liege.clone().into())]);
        }
        for s in self.spouses.iter() {
            collection.extend([E::from(s.clone().into())]);
        }
        for s in self.former.iter() {
            collection.extend([E::from(s.clone().into())]);
        }
        for s in self.children.iter() {
            collection.extend([E::from(s.clone().into())]);
        }
        for s in self.parents.iter() {
            collection.extend([E::from(s.clone().into())]);
        }
        for s in self.kills.iter() {
            collection.extend([E::from(s.clone().into())]);
        }
        for s in self.vassals.iter() {
            match s {
                Vassal::Character(c) => collection.extend([E::from(c.clone().into())]),
                Vassal::Reference(c) => {
                    if let Some(internal) = c.get_internal().as_ref() {
                        collection.extend([E::from(internal.clone().into())]);
                    }
                }
            }
        }
        for s in self.titles.iter() {
            collection.extend([E::from(s.clone().into())]);
        }
        for m in self.memories.iter() {
            collection.extend([E::from(m.clone().into())]);
        }
        for a in self.artifacts.iter() {
            collection.extend([E::from(a.clone().into())]);
        }
    }
}

impl Localizable for Character {
    fn localize(&mut self, localization: &GameData) -> Result<(), LocalizationError> {
        self.name = localization.localize(&self.name)?;
        if let Some(nick) = &self.nick {
            self.nick = Some(localization.localize(nick)?);
        }
        if let Some(reason) = &self.reason {
            self.reason = Some(localization.localize_query(reason, |stack| {
                if stack.len() == 2 {
                    if stack[0].0 == "GetTrait" {
                        return localization
                            .localize("trait_".to_string() + &stack[0].1[0])
                            .ok();
                    } else if stack[1].0 == "GetHerHis" {
                        if self.female {
                            return Some("her".into());
                        } else {
                            return Some("his".into());
                        }
                    } else if stack[1].0 == "GetHerHim" {
                        if self.female {
                            return Some("her".into());
                        } else {
                            return Some("him".into());
                        }
                    } else if stack[1].0 == "GetHerselfHimself" {
                        if self.female {
                            return Some("herself".into());
                        } else {
                            return Some("himself".into());
                        }
                    } else if stack[1].0 == "GetSheHe" {
                        if self.female {
                            return Some("she".into());
                        } else {
                            return Some("he".into());
                        }
                    } else if stack[0].0 == "TARGET_CHARACTER" && stack[1].0 == "GetUIName" {
                        return Some("an unknown assailant".into()); // TODO
                    }
                }
                None
            })?);
        }
        for t in self.traits.iter_mut() {
            let key = if t.starts_with("child_of_concubine") {
                "trait_child_of_concubine".to_string()
            } else if t.ends_with("hajjaj") {
                if self.female {
                    "trait_hajjah".to_string()
                } else {
                    "trait_hajji".to_string()
                }
            } else if t.as_ref() == "lifestyle_traveler" {
                // TODO this should reflect the traveler level? i think
                "trait_traveler_1".to_string()
            } else if t.starts_with("viking") {
                // TODO viking should be displayed if the culture has longships (trait_viking_has_longships)
                "trait_viking_fallback".to_string()
            } else if t.starts_with("shieldmaiden") {
                if self.female {
                    "trait_shieldmaiden_female".to_string()
                } else {
                    "trait_shieldmaiden_male".to_string()
                }
            } else {
                "trait_".to_string() + t
            };
            *t = localization.localize(key)?;
        }
        for t in self.languages.iter_mut() {
            *t = localization.localize(t.to_string() + "_name")?;
        }

        Ok(())
    }
}

#[cfg(feature = "display")]
mod display {
    use super::super::super::super::display::{ProceduralPath, Renderable, TreeNode};
    use super::*;

    impl TreeNode<Vec<GameRef<Character>>> for Character {
        fn get_children(&self) -> Option<Vec<GameRef<Character>>> {
            if self.children.is_empty() {
                return None;
            }
            Some(self.children.clone())
        }

        fn get_parent(&self) -> Option<Vec<GameRef<Character>>> {
            if self.parents.is_empty() {
                return None;
            }
            Some(self.parents.clone())
        }

        fn get_class(&self) -> Option<GameString> {
            if let Some(house) = &self.house {
                if let Some(house) = house.get_internal().inner() {
                    return Some(house.get_name());
                } else {
                    None
                }
            } else {
                None
            }
        }
    }

    impl ProceduralPath for Character {
        const SUBDIR: &'static str = "characters";
    }

    impl Renderable for GameObjectEntity<Character> {
        const TEMPLATE_NAME: &'static str = "charTemplate";
    }
}
