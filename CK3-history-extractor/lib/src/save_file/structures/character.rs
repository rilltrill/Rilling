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
        let reflexive = if self.female { "herself" } else { "himself" };

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

        let vassal_count = self.vassals.len();

        // Collect information about people they killed
        let kill_victims: Vec<String> = self.kills.iter()
            .filter_map(|k| k.get_internal().inner().map(|c| c.get_name().to_string()))
            .take(3)
            .collect();
        let kill_count = self.kills.len();

        // Collect artifact information
        let artifact_names: Vec<String> = self.artifacts.iter()
            .filter_map(|a| a.get_internal().inner().map(|art| art.get_name().to_string()))
            .take(3)
            .collect();

        let nickname = self.nick.as_ref().map(|n| n.to_string());
        let death_reason = self.reason.as_ref().map(|r| r.to_string());

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

        // Paragraph 1: Birth and Origins with nickname
        let mut origin = String::new();

        // Start with name and nickname if available
        if let Some(ref nick) = nickname {
            origin.push_str(&format!("{}, known throughout the realm as \"{}\", was born on {}",
                self.name.as_ref(), nick, self.birth.iso_8601()));
        } else {
            origin.push_str(&format!("{} was born on {}", self.name.as_ref(), self.birth.iso_8601()));
        }

        if let Some(ref culture) = culture_name {
            origin.push_str(&format!(", into the {} culture", culture));
        }

        if let Some(ref faith) = faith_name {
            origin.push_str(&format!(", a devoted adherent of the {} faith", faith));
        }

        origin.push('.');

        if let Some(ref house) = house_name {
            origin.push_str(&format!(" {} belonged to the illustrious house of {}", pronoun, house));
            if !parent_names.is_empty() {
                origin.push_str(&format!(", born as the {} of {}",
                    if self.female { "daughter" } else { "son" },
                    parent_names.join(" and ")));
            }
            origin.push_str(", a lineage that would shape {} destiny from birth.");
        } else {
            origin.push_str(&format!(" Despite {} humble, lowborn origins", possessive));
            if !parent_names.is_empty() {
                origin.push_str(&format!(", the {} of {}",
                    if self.female { "daughter" } else { "son" },
                    parent_names.join(" and ")));
            }
            origin.push_str(&format!(", {} would rise through sheer determination and cunning to heights rarely seen by those of common birth.", pronoun.to_lowercase()));
        }

        paragraphs.push(origin);

        // Paragraph 2: Personality, Physical Description, and Character
        if !self.traits.is_empty() || self.skills.len() >= 6 || self.strength > 0.0 {
            let mut personality = String::new();

            // Physical description based on strength
            if self.strength > 12.0 {
                personality.push_str(&format!("{} possessed formidable physical strength, a warrior's build that commanded respect and fear in equal measure. ", pronoun));
            } else if self.strength > 8.0 {
                personality.push_str(&format!("Of sturdy constitution and notable physical presence, {} cut an impressive figure. ", pronoun.to_lowercase()));
            } else if self.strength < 4.0 {
                personality.push_str(&format!("Though physically frail and of delicate constitution, {} compensated for bodily weakness with other gifts. ", pronoun.to_lowercase()));
            }

            // Trait descriptions with more vivid language
            let trait_count = self.traits.len().min(10);
            if trait_count > 0 {
                personality.push_str(&format!("{} ", pronoun));

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

                if traits_str.len() == 1 {
                    personality.push_str(&format!("was renowned as {} individual", traits_str[0]));
                } else if traits_str.len() == 2 {
                    personality.push_str(&format!("was characterized as both {} and {}", traits_str[0], traits_str[1]));
                } else {
                    let last = &traits_str[traits_str.len()-1];
                    let rest = &traits_str[..traits_str.len()-1];
                    personality.push_str(&format!("exhibited a complex character, being {}, and {}", rest.join(", "), last));
                }
                personality.push_str("—traits that profoundly influenced {} decisions and legacy");
                personality.push_str(&format!("—traits that profoundly influenced {} decisions and legacy. ", possessive));
            }

            // Detailed skill analysis
            if self.skills.len() >= 6 {
                let skill_names = ["diplomacy", "martial command", "stewardship",
                                   "intrigue", "scholarship", "personal combat"];
                let skill_descriptors = [
                    ("diplomacy", "masterful statecraft", "diplomatic acumen", "skill in negotiations"),
                    ("martial command", "brilliant military strategy", "tactical genius", "prowess in warfare"),
                    ("stewardship", "exceptional administrative ability", "economic wisdom", "domain management"),
                    ("intrigue", "cunning and manipulation", "mastery of court politics", "skill in subterfuge"),
                    ("scholarship", "profound intellectual achievements", "scholarly pursuits", "academic excellence"),
                    ("personal combat", "deadly skill in arms", "martial excellence", "prowess on the battlefield")
                ];

                let mut notable_skills: Vec<(usize, i8)> = self.skills.iter().enumerate()
                    .filter(|(_, &val)| val > 10)
                    .map(|(idx, &val)| (idx, val))
                    .collect();
                notable_skills.sort_by_key(|(_, val)| -val);

                if !notable_skills.is_empty() {
                    let top_skill = notable_skills[0];
                    let skill_value = top_skill.1;

                    if skill_value > 20 {
                        personality.push_str(&format!("{} was legendary for {} {}",
                            pronoun,
                            possessive,
                            skill_descriptors[top_skill.0].1));
                    } else if skill_value > 15 {
                        personality.push_str(&format!("{} demonstrated remarkable {}",
                            pronoun,
                            skill_descriptors[top_skill.0].2));
                    } else {
                        personality.push_str(&format!("{} showed considerable {}",
                            pronoun,
                            skill_descriptors[top_skill.0].3));
                    }

                    if notable_skills.len() > 1 {
                        let second_skill = notable_skills[1];
                        personality.push_str(&format!(", combined with exceptional {}",
                            skill_names[second_skill.0]));

                        if notable_skills.len() > 2 {
                            let third_skill = notable_skills[2];
                            personality.push_str(&format!(" and impressive {}",
                                skill_names[third_skill.0]));
                        }
                        personality.push_str(", making {} a truly formidable figure of the age");
                        personality.push_str(&format!(", making {} a truly formidable figure of the age. ", objective));
                    } else {
                        personality.push_str(". ");
                    }
                }

                // Mention weaknesses if any skills are particularly low
                let weak_skills: Vec<(usize, i8)> = self.skills.iter().enumerate()
                    .filter(|(_, &val)| val < 6)
                    .map(|(idx, &val)| (idx, val))
                    .collect();

                if !weak_skills.is_empty() && weak_skills.len() <= 2 {
                    personality.push_str(&format!("However, {} notably lacked aptitude in ",
                        pronoun.to_lowercase()));
                    let weak_names: Vec<&str> = weak_skills.iter()
                        .map(|(idx, _)| skill_names[*idx])
                        .collect();
                    if weak_names.len() == 1 {
                        personality.push_str(weak_names[0]);
                    } else {
                        personality.push_str(&format!("{} and {}", weak_names[0], weak_names[1]));
                    }
                    personality.push_str(", a deficiency that would prove consequential.");
                }
            }

            if !personality.is_empty() {
                paragraphs.push(personality);
            }
        }

        // Paragraph 3: Political Career, Artifacts, and Military Achievements
        if !title_names.is_empty() || !artifact_names.is_empty() || kill_count > 0 {
            let mut political = String::new();

            if !title_names.is_empty() {
                political.push_str(&format!("Throughout {} illustrious career, {} ", possessive, self.name.as_ref()));

                if title_names.len() == 1 {
                    political.push_str(&format!("reigned as {}", title_names[0]));
                } else if title_names.len() == 2 {
                    political.push_str(&format!("held dominion as both {} and {}", title_names[0], title_names[1]));
                } else if title_names.len() == 3 {
                    political.push_str(&format!("ruled simultaneously as {}, {}, and {}, a remarkable concentration of power",
                        title_names[0], title_names[1], title_names[2]));
                } else {
                    political.push_str(&format!("accumulated an unprecedented {} titles, reigning most prominently as {} and {}, consolidating vast territories under {} dominion",
                        title_names.len(), title_names[0], title_names[1], possessive));
                }

                political.push_str(". ");

                // Vassals information
                if vassal_count > 20 {
                    political.push_str(&format!("{} commanded the loyalty of over {} vassals, presiding over a sprawling feudal hierarchy that extended {} influence across the realm. ",
                        pronoun, vassal_count, possessive));
                } else if vassal_count > 5 {
                    political.push_str(&format!("Commanding {} vassals, {} maintained a complex web of feudal obligations and allegiances. ",
                        vassal_count, pronoun.to_lowercase()));
                }

                // Liege relationship
                if let Some(ref liege) = liege_name {
                    political.push_str(&format!("Despite {} own considerable power, {} remained bound by feudal oath to {}, navigating the delicate balance between autonomy and loyalty. ",
                        possessive, pronoun.to_lowercase(), liege));
                } else if !title_names.is_empty() && vassal_count > 0 {
                    political.push_str(&format!("{} ruled as an independent sovereign, beholden to no higher authority, the supreme power within {} realm. ",
                        pronoun, possessive));
                }
            }

            // Artifacts - symbols of power and prestige
            if !artifact_names.is_empty() {
                if artifact_names.len() == 1 {
                    political.push_str(&format!("{} possessed the legendary artifact {}, a symbol of {} power and legitimacy. ",
                        pronoun, artifact_names[0], possessive));
                } else if artifact_names.len() == 2 {
                    political.push_str(&format!("Among {} prized possessions were the artifacts {} and {}, objects of immense cultural and political significance. ",
                        possessive, artifact_names[0], artifact_names[1]));
                } else {
                    political.push_str(&format!("{} accumulated a remarkable collection of artifacts including {}, {}, and {}, each enhancing {} prestige and authority. ",
                        pronoun, artifact_names[0], artifact_names[1], artifact_names[2], possessive));
                }
            }

            // Military achievements and kills
            if kill_count > 0 {
                if kill_count > 5 {
                    political.push_str(&format!("{} personally slew {} enemies in battle and assassination",
                        pronoun, kill_count));
                    if !kill_victims.is_empty() {
                        political.push_str(&format!(", including notable figures such as {}", kill_victims.join(", ")));
                    }
                    political.push_str(&format!(", establishing {} reputation as a ruthless and deadly adversary. ", reflexive));
                } else if kill_count > 2 {
                    political.push_str(&format!("In acts of violence that secured {} position, {} eliminated {} rivals",
                        possessive, pronoun.to_lowercase(), kill_count));
                    if !kill_victims.is_empty() {
                        political.push_str(&format!(", most notably {}", kill_victims.join(" and ")));
                    }
                    political.push_str(". ");
                } else if !kill_victims.is_empty() {
                    political.push_str(&format!("In a defining act, {} personally killed {}, removing a dangerous rival. ",
                        pronoun.to_lowercase(), kill_victims[0]));
                }
            }

            // Achievements based on stats
            let mut achievements = Vec::new();

            if self.prestige > 5000.0 {
                achievements.push(format!("{} became a legend in {} own time, accumulating staggering prestige ({:.0}) that would be remembered for generations", pronoun, possessive, self.prestige));
            } else if self.prestige > 2000.0 {
                achievements.push(format!("achieving extraordinary renown with prestige exceeding {:.0}", self.prestige));
            } else if self.prestige > 1000.0 {
                achievements.push(format!("earning substantial prestige ({:.0}) throughout {} reign", self.prestige, possessive));
            }

            if self.gold > 5000.0 {
                achievements.push(format!("amassing a legendary treasury of over {:.0} gold, unprecedented wealth that funded grand ambitions", self.gold));
            } else if self.gold > 2000.0 {
                achievements.push(format!("accumulating remarkable riches totaling {:.0} gold", self.gold));
            } else if self.gold > 1000.0 {
                achievements.push(format!("building substantial wealth of {:.0} gold", self.gold));
            }

            if self.dread > 90.0 {
                achievements.push(format!("wielding absolute terror as a weapon of statecraft—{} very name struck paralyzing fear into the hearts of all who heard it", possessive));
            } else if self.dread > 70.0 {
                achievements.push(format!("ruling through calculated brutality and intimidation, maintaining iron control through fear"));
            } else if self.dread > 50.0 {
                achievements.push(format!("maintaining order through strategic displays of force and severity"));
            }

            if self.piety > 5000.0 {
                achievements.push(format!("attaining saintly devotion with piety exceeding {:.0}, revered as a paragon of religious virtue", self.piety));
            } else if self.piety > 2000.0 {
                achievements.push(format!("demonstrating exceptional religious devotion ({:.0} piety), earning the favor of the faith", self.piety));
            } else if self.piety > 1000.0 {
                achievements.push(format!("gaining recognition for {} sincere religious commitment", possessive));
            }

            if !achievements.is_empty() {
                if !political.is_empty() && !political.ends_with(". ") {
                    political.push_str(". ");
                }
                political.push_str(&achievements.join("; "));
                political.push('.');
            }

            if !political.is_empty() {
                paragraphs.push(political);
            }
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
                        family.push_str(&format!("In matters of the heart, {} united in matrimony with {}, forging a bond that would shape {} personal life",
                            self.name.as_ref(), normal[0].0, possessive));
                    } else if normal.len() == 2 {
                        family.push_str(&format!("{} entered into marriage twice, wedding {} and later {}, each union serving both personal and political purposes",
                            self.name.as_ref(), normal[0].0, normal[1].0));
                    } else {
                        family.push_str(&format!("In a pattern of serial matrimony, {} wed {} different spouses throughout {} lifetime, each marriage reflecting shifting alliances and ambitions",
                            self.name.as_ref(), normal.len(), possessive));
                    }
                }

                // Add scandalous relationships with extreme disdain
                if !scandalous.is_empty() {
                    if !normal.is_empty() {
                        family.push_str(". ");
                    }

                    if scandalous.len() == 1 {
                        let (spouse_name, relationship) = scandalous[0];
                        family.push_str(&format!("Most infamously and reprehensibly, {} descended into depraved immorality by taking {} as {} lover",
                            pronoun.to_lowercase(), spouse_name, possessive));
                        if let Some(rel) = relationship {
                            family.push_str(&format!("—shockingly, {}", rel));
                        }
                        family.push_str(&format!("—an utterly abhorrent transgression that violated every sacred law of God and nature, scandalizing all who learned of this vile and unnatural union, bringing shame upon {} house and defiling the very bonds of kinship",
                            possessive));
                    } else {
                        family.push_str(&format!("In a pattern of shocking depravity that defies moral comprehension, {} engaged in multiple abominable relationships: ",
                            pronoun.to_lowercase()));
                        for (i, (spouse_name, relationship)) in scandalous.iter().enumerate() {
                            if i > 0 {
                                family.push_str(", then ");
                            }
                            family.push_str(&format!("{}", spouse_name));
                            if let Some(rel) = relationship {
                                family.push_str(&format!(" ({})", rel));
                            }
                        }
                        family.push_str(&format!(". These repugnant violations of natural and divine law represented a moral nadir that contemporaries condemned as utterly inexcusable, staining {} legacy with indelible infamy",
                            possessive));
                    }
                }
            }

            // Children and dynastic legacy
            if child_count > 0 {
                if !family.is_empty() {
                    family.push_str(". ");
                }

                if child_count > 15 {
                    family.push_str(&format!("{} proved remarkably fecund, siring an extraordinary {} offspring",
                        self.name.as_ref(), child_count));
                    if !child_names.is_empty() {
                        family.push_str(&format!(", among them {}", child_names.join(", ")));
                    }
                    family.push_str(&format!(", thereby securing {} bloodline's continuation through an unprecedented proliferation of descendants. This vast progeny ensured {} dynastic legacy would endure for generations",
                        possessive, possessive));
                } else if child_count > 5 {
                    family.push_str(&format!("{} fathered {} children", self.name.as_ref(), child_count));
                    if !child_names.is_empty() {
                        family.push_str(&format!(", including the notable {}", child_names.join(", ")));
                    }
                    family.push_str(&format!(", securing {} lineage and providing numerous potential heirs to {} titles and ambitions",
                        possessive, possessive));
                } else if child_count > 1 {
                    family.push_str(&format!("{} produced {} heirs", self.name.as_ref(), child_count));
                    if !child_names.is_empty() {
                        family.push_str(&format!(": {}", child_names.join(" and ")));
                    }
                    family.push_str(&format!(", each representing the continuation of {} dynastic aspirations", possessive));
                } else {
                    family.push_str(&format!("{} had one child", self.name.as_ref()));
                    if !child_names.is_empty() {
                        family.push_str(&format!(", {}", child_names[0]));
                    }
                    family.push_str(&format!(", upon whom rested all {} hopes for dynastic continuity", possessive));
                }
            }

            if !family.is_empty() {
                family.push('.');
                paragraphs.push(family);
            }
        }

        // Paragraph 5: Death and Final Legacy
        if self.dead {
            let mut death = String::new();

            if let Some(ref death_date) = self.date {
                let age = death_date.year() - self.birth.year();

                // Dramatic death description based on reason
                if let Some(ref reason) = death_reason {
                    let reason_str = reason.to_lowercase();

                    if reason_str.contains("murder") || reason_str.contains("assassin") {
                        death.push_str(&format!("{}'s life was violently cut short on {} when {} fell victim to murder",
                            self.name.as_ref(), death_date.iso_8601(), pronoun.to_lowercase()));
                        if age < 30 {
                            death.push_str(&format!(", slain in {} prime at merely {} years of age", possessive, age));
                        } else {
                            death.push_str(&format!(" at age {}", age));
                        }
                        death.push_str(&format!(". The assassination of {} marked a dark turning point, leaving contemporaries to wonder who orchestrated {} demise",
                            objective, possessive));
                    } else if reason_str.contains("execution") || reason_str.contains("executed") {
                        death.push_str(&format!("On {}, {}'s tumultuous life reached its grim conclusion upon the executioner's block",
                            death_date.iso_8601(), self.name.as_ref()));
                        if age < 35 {
                            death.push_str(&format!(", condemned to death at the young age of {}", age));
                        } else {
                            death.push_str(&format!(", meeting {} fate at age {}", possessive, age));
                        }
                        death.push_str(&format!(". {} execution served as a stark reminder of the precarious nature of power and the ruthlessness of political conflict",
                            possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..]));
                    } else if reason_str.contains("battle") || reason_str.contains("combat") {
                        death.push_str(&format!("{} met a warrior's end on {}, falling in battle at age {}",
                            self.name.as_ref(), death_date.iso_8601(), age));
                        if age < 25 {
                            death.push_str(&format!(", a young {} cut down in the chaos of combat", if self.female { "woman" } else { "man" }));
                        } else if age > 60 {
                            death.push_str(&format!(", remarkably still fighting on the field despite {} advanced years", possessive));
                        }
                        death.push_str(&format!(". {} death in combat was perhaps fitting for one who had lived by the sword",
                            possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..]));
                    } else if reason_str.contains("disease") || reason_str.contains("illness") || reason_str.contains("plague") {
                        death.push_str(&format!("Disease claimed {} on {}, succumbing to {} at age {}",
                            objective, death_date.iso_8601(), reason, age));
                        if age < 20 {
                            death.push_str(&format!(", tragically young to be struck down by sickness"));
                        } else if age > 70 {
                            death.push_str(&format!(", though {} had already outlived most contemporaries", pronoun.to_lowercase()));
                        }
                        death.push_str(&format!(". The affliction that ended {} life respected neither rank nor power",
                            possessive));
                    } else if reason_str.contains("old age") || reason_str.contains("natural") {
                        if age > 80 {
                            death.push_str(&format!("{} peacefully departed this world on {}, succumbing to the weight of {} extraordinary {} years",
                                self.name.as_ref(), death_date.iso_8601(), possessive, age));
                            death.push_str(&format!(". Having achieved a lifespan almost miraculous for the age, {} passed into legend as one who had seen empires rise and fall",
                                pronoun.to_lowercase()));
                        } else if age > 65 {
                            death.push_str(&format!("On {}, {} yielded to the inevitable passage of time, dying of natural causes at the respectable age of {}",
                                death_date.iso_8601(), self.name.as_ref(), age));
                        } else {
                            death.push_str(&format!("{} died on {} of natural causes at age {}", self.name.as_ref(), death_date.iso_8601(), age));
                        }
                    } else {
                        // Generic death with reason
                        death.push_str(&format!("{} met {} end on {}, dying of {} at age {}",
                            self.name.as_ref(), possessive, death_date.iso_8601(), reason, age));
                        if age < 30 {
                            death.push_str(&format!(", cruelly young to meet such a fate"));
                        } else if age > 70 {
                            death.push_str(&format!(", having nonetheless lived far longer than most"));
                        }
                    }
                } else {
                    // No death reason specified
                    death.push_str(&format!("{} departed this mortal realm on {}", self.name.as_ref(), death_date.iso_8601()));

                    if age > 75 {
                        death.push_str(&format!(" at the venerable age of {}, having witnessed the passage of generations", age));
                    } else if age > 60 {
                        death.push_str(&format!(" at age {}, having lived a full life by the standards of the era", age));
                    } else if age < 25 {
                        death.push_str(&format!(", tragically cut down at merely {} years of age, {} potential forever unfulfilled", age, possessive));
                    } else if age < 40 {
                        death.push_str(&format!(" at the untimely age of {}, robbed of the years that might have been", age));
                    } else {
                        death.push_str(&format!(" at age {}", age));
                    }
                }
            } else {
                // No death date available
                death.push_str(&format!("{} passed from the annals of the living, though the precise circumstances of {} demise remain unrecorded",
                    self.name.as_ref(), possessive));
            }

            // Legacy through descendants
            if child_count > 20 {
                death.push_str(&format!(". Yet {} legacy proved immortal, living on through an astounding {} offspring whose own descendants would number in the hundreds, ensuring {} bloodline's dominance for centuries to come",
                    possessive, child_count, possessive));
            } else if child_count > 10 {
                death.push_str(&format!(". Nevertheless, {} ensured {} immortality through {} impressive brood of {} children, whose own progeny would carry {} blood through the generations",
                    pronoun.to_lowercase(), possessive, possessive, child_count, possessive));
            } else if child_count > 5 {
                death.push_str(&format!(". {} left behind {} children to preserve {} lineage and vie for {} inheritance",
                    pronoun, child_count, possessive, possessive));
            } else if child_count > 1 {
                death.push_str(&format!(". {} heirs survived {} to perpetuate {} dynasty",
                    possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..],
                    objective, possessive));
            } else if child_count == 1 {
                death.push_str(&format!(". A single heir remained to carry the burden of {} legacy into an uncertain future",
                    possessive));
            } else {
                death.push_str(&format!(". {} died without issue, {} line ending forever",
                    pronoun, possessive));
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
