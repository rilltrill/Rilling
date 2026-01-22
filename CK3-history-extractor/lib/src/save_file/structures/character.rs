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

    /// Generates a comprehensive narrative life story for the character (extensive, detailed biography)
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

        // Collect ALL children names for comprehensive descriptions
        let child_names: Vec<String> = self.children.iter()
            .filter_map(|c| c.get_internal().inner().map(|ch| ch.get_name().to_string()))
            .collect();

        let child_count = self.children.len();

        let vassal_count = self.vassals.len();

        // Collect ALL kill victims for detailed accounting
        let kill_victims: Vec<String> = self.kills.iter()
            .filter_map(|k| k.get_internal().inner().map(|c| c.get_name().to_string()))
            .collect();
        let kill_count = self.kills.len();

        // Collect ALL artifacts for comprehensive inventory
        let artifact_names: Vec<String> = self.artifacts.iter()
            .filter_map(|a| a.get_internal().inner().map(|art| art.get_name().to_string()))
            .collect();

        let nickname = self.nick.as_ref().map(|n| n.to_string());
        let death_reason = self.reason.as_ref().map(|r| r.to_string());

        // Collect language information for cultural detail
        let languages: Vec<String> = self.languages.iter()
            .map(|l| l.to_string())
            .collect();

        // Collect memory/event count for life event details
        let memory_count = self.memories.len();

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

        // SECTION 1: Birth, Origins, and Early Life - Comprehensive Introduction
        let mut origin = String::new();

        // Opening with full titulature and nickname
        if let Some(ref nick) = nickname {
            origin.push_str(&format!("{}, who would become known throughout the realm and beyond as \"{}\", entered the world on the {}",
                self.name.as_ref(), nick, self.birth.iso_8601()));
        } else {
            origin.push_str(&format!("{} was born on the {}", self.name.as_ref(), self.birth.iso_8601()));
        }

        // Calculate birth circumstances based on available data
        let birth_year = self.birth.year();
        origin.push_str(&format!(", in the year {} of the Common Era", birth_year));

        // Add cultural and religious context with expanded detail
        if let Some(ref culture) = culture_name {
            origin.push_str(&format!(", into the {} culture, inheriting the traditions, customs, and worldview of {} people", culture, possessive));
        }

        if let Some(ref faith) = faith_name {
            origin.push_str(&format!(". From {} earliest days, {} was raised within the {} faith, its doctrines and rituals shaping {} understanding of the divine and {} place in the cosmos",
                possessive, pronoun.to_lowercase(), faith, possessive, possessive));
        } else {
            origin.push('.');
        }

        // Detailed family background
        if let Some(ref house) = house_name {
            origin.push_str(&format!(" {} lineage traced back through the prestigious and ancient house of {}, a dynasty whose name carried weight and whose blood was considered noble",
                possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], house));

            if !parent_names.is_empty() {
                if parent_names.len() == 1 {
                    origin.push_str(&format!(". Born as the {} of {}, {} inherited not only the material wealth of {} forebears but also their expectations, ambitions, and the burden of dynastic continuity",
                        if self.female { "daughter" } else { "son" },
                        parent_names[0],
                        pronoun.to_lowercase(),
                        possessive));
                } else {
                    origin.push_str(&format!(". As the {} of {} and {}, {} was born into a world of privilege and responsibility, where every action would be judged against the illustrious deeds of {} ancestors",
                        if self.female { "daughter" } else { "son" },
                        parent_names[0],
                        parent_names[1],
                        pronoun.to_lowercase(),
                        possessive));
                }
            } else {
                origin.push_str(&format!(". Though the specific identities of {} immediate progenitors are lost to history, the noble blood of {} house coursed through {} veins, marking {} as one destined for greatness or infamy",
                    possessive, possessive, possessive, objective));
            }

            origin.push_str(&format!(". The circumstances of {} birth, within the halls of power and surrounded by the trappings of nobility, would fundamentally shape {} character, providing both opportunities unavailable to common folk and imposing expectations that would drive {} throughout {} life",
                possessive, possessive, objective, possessive));

        } else {
            // Lowborn origins - expand dramatically on rise from nothing
            origin.push_str(&format!(" Yet {} origins were far from noble", possessive));

            if !parent_names.is_empty() {
                if parent_names.len() == 1 {
                    origin.push_str(&format!(". Born to {}, a figure of common stock, {} entered life without the advantages of noble blood, inherited titles, or dynastic connections",
                        parent_names[0], pronoun.to_lowercase()));
                } else {
                    origin.push_str(&format!(". The {} of {} and {}, {} was born into obscurity, lacking the noble pedigree that opened doors and commanded respect in the medieval world",
                        if self.female { "daughter" } else { "son" },
                        parent_names[0],
                        parent_names[1],
                        pronoun.to_lowercase()));
                }
            } else {
                origin.push_str(&format!(". Born to parents whose names are lost to history, {} began life in the lowest strata of society, where survival itself was an achievement and ambition often seemed a cruel jest",
                    pronoun.to_lowercase()));
            }

            origin.push_str(&format!(". In an age where social mobility was constrained by rigid hierarchies and birth determined destiny, {}'s lowborn status represented a seemingly insurmountable obstacle to power and prestige. Yet this very disadvantage would forge in {} a hunger, determination, and ruthless pragmatism that noble-born rivals, softened by inherited privilege, could scarcely match. What {} lacked in noble ancestry, {} would compensate for through raw ability, political cunning, and an unquenchable will to transcend the circumstances of {} birth. {} story is thus one of the most remarkable in an era that rarely permitted such dramatic ascensions—a testament to what could be achieved when ambition met opportunity, regardless of the accident of birth",
                pronoun, objective, pronoun.to_lowercase(), pronoun.to_lowercase(), possessive, possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..]));
        }

        paragraphs.push(origin);

        // SECTION 2: Physical Appearance, Personality, Character, and Abilities - Comprehensive Analysis
        let mut personality = String::new();

        // Detailed physical description
        personality.push_str(&format!("In physical form, {} ", self.name.as_ref()));

        if self.strength > 15.0 {
            personality.push_str(&format!("was a specimen of extraordinary physical power, possessing the kind of formidable strength that made {} a terror in personal combat. {} muscular frame, hardened through years of training and warfare, commanded immediate respect and inspired fear in those who might oppose {}. This physical dominance was not merely for show—it translated directly into prowess on the battlefield, where {} could cleave through armor and bone with devastating effect",
                objective, possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], objective, pronoun.to_lowercase()));
        } else if self.strength > 12.0 {
            personality.push_str(&format!("possessed formidable physical strength and a warrior's build. {} constitution was robust, {} body hardened by martial training. This physical power granted {} significant advantages in personal combat and helped establish {} reputation as a formidable opponent",
                possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], possessive, objective, possessive));
        } else if self.strength > 8.0 {
            personality.push_str(&format!("cut a sturdy and capable figure. Of sound constitution and respectable physical presence, {} enjoyed the vigor necessary for the demands of rulership, though {} was not considered among the greatest physical specimens of the age",
                pronoun.to_lowercase(), pronoun.to_lowercase()));
        } else if self.strength > 4.0 {
            personality.push_str(&format!("possessed an average physical constitution for the era. Neither particularly strong nor notably weak, {} physique was unremarkable, fitting the common mold of {} contemporaries",
                possessive, possessive));
        } else {
            personality.push_str(&format!("was physically frail and of delicate constitution. {} body lacked the robust strength prized in an age that often celebrated martial prowess. This physical weakness was evident to all who knew {}, marking {} as unsuited for the rigors of personal combat. Yet what {} lacked in bodily might, {} compensated for through other gifts, demonstrating that power in the medieval world could manifest in forms beyond mere physical strength",
                possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], objective, objective, pronoun.to_lowercase(), pronoun.to_lowercase()));
        }

        personality.push_str(". ");

        // Comprehensive trait analysis - list ALL traits with detailed descriptions
        if !self.traits.is_empty() {
            let all_traits: Vec<String> = self.traits.iter()
                .map(|t| t.to_string().to_lowercase())
                .collect();

            personality.push_str(&format!("The character of {} was complex and multifaceted, defined by {} traits that contemporaries observed and chronicled. ", self.name.as_ref(), all_traits.len()));

            if all_traits.len() == 1 {
                personality.push_str(&format!("{} was notably {}, a characteristic that colored all {} interactions and decisions",
                    pronoun, all_traits[0], possessive));
            } else if all_traits.len() <= 3 {
                let traits_with_articles: Vec<String> = all_traits.iter()
                    .map(|t| {
                        if t.starts_with(|c: char| "aeiou".contains(c)) {
                            format!("an {}", t)
                        } else {
                            format!("a {}", t)
                        }
                    })
                    .collect();
                personality.push_str(&format!("{} was characterized as {}, traits that fundamentally shaped {} worldview and approach to power",
                    pronoun, traits_with_articles.join(", and "), possessive));
            } else {
                // For many traits, describe them in groups
                personality.push_str(&format!("Observers described {} as possessing the following characteristics: {}. This constellation of traits—some complementary, others contradictory—created a personality of remarkable complexity. {} character was not easily reduced to simple categorizations; rather, {} embodied the full range of human virtues and vices, making {} both fascinating and unpredictable to {} contemporaries",
                    objective,
                    all_traits.join(", "),
                    possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..],
                    pronoun.to_lowercase(),
                    objective,
                    possessive));
            }

            personality.push_str(". ");
        }

        // Extremely detailed skill analysis with actual numbers
        if self.skills.len() >= 6 {
            let skill_names = ["Diplomacy", "Martial", "Stewardship", "Intrigue", "Learning", "Prowess"];

            personality.push_str(&format!("An objective analysis of {} capabilities reveals a detailed profile of strengths and weaknesses. ", possessive));

            // Describe each skill individually with its exact value
            personality.push_str(&format!("In the realm of diplomacy and statecraft, {} scored {} out of a theoretical maximum—",
                pronoun.to_lowercase(), self.skills[0]));
            if self.skills[0] > 20 {
                personality.push_str("a legendary level of ability that placed {} among the greatest diplomatists of the age, capable of navigating the most treacherous political waters with grace and securing advantageous alliances through sheer force of personality and negotiating brilliance");
            } else if self.skills[0] > 15 {
                personality.push_str("a remarkable achievement indicating exceptional talent in negotiations, court politics, and the subtle arts of persuasion");
            } else if self.skills[0] > 10 {
                personality.push_str("a respectable showing that marked {} as competent in diplomatic affairs, though not among the great masters of statecraft");
            } else if self.skills[0] > 5 {
                personality.push_str("a mediocre level suggesting limited aptitude for the subtleties of diplomacy");
            } else {
                personality.push_str("an abysmal score revealing profound weakness in diplomatic matters, making {} a liability in negotiations and political maneuvering");
            }

            personality.push_str(&format!(". {} martial prowess registered at {}, ",
                possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], self.skills[1]));
            if self.skills[1] > 20 {
                personality.push_str(&format!("establishing {} as a military genius whose strategic and tactical brilliance could turn the tide of battles and wars. {} understanding of warfare—from grand strategy to battlefield tactics—was unparalleled", objective, possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..]));
            } else if self.skills[1] > 15 {
                personality.push_str("reflecting considerable military talent and the ability to command armies effectively in the field");
            } else if self.skills[1] > 10 {
                personality.push_str("indicating adequate military competence without particular distinction");
            } else if self.skills[1] > 5 {
                personality.push_str("revealing significant deficiencies in military matters");
            } else {
                personality.push_str(&format!("exposing {} as dangerously incompetent in warfare—a critical weakness in an age where military capability often determined political survival", objective));
            }

            personality.push_str(&format!(". Administrative and economic acumen, measured by a stewardship score of {}, ",
                self.skills[2]));
            if self.skills[2] > 20 {
                personality.push_str(&format!("demonstrated {} as an administrative genius capable of managing vast domains, optimizing revenues, and implementing complex bureaucratic reforms that would increase {} realm's prosperity and efficiency", objective, possessive));
            } else if self.skills[2] > 15 {
                personality.push_str("showed exceptional ability in managing domains, collecting revenues, and administering complex territories");
            } else if self.skills[2] > 10 {
                personality.push_str("indicated competent management skills adequate for governing territories of moderate size");
            } else {
                personality.push_str(&format!("revealed poor administrative capabilities that would hamper {} ability to effectively manage {} holdings", possessive, possessive));
            }

            personality.push_str(&format!(". In the shadows and back-channels where intrigue festered, {} rated {}, ",
                pronoun.to_lowercase(), self.skills[3]));
            if self.skills[3] > 20 {
                personality.push_str(&format!("a score that marked {} as a master manipulator, spy master, and schemer whose webs of conspiracy and networks of informants made {} perhaps more dangerous in the shadows than on any battlefield", objective, objective));
            } else if self.skills[3] > 15 {
                personality.push_str("demonstrating considerable cunning and skill in the dark arts of political manipulation, espionage, and conspiracy");
            } else if self.skills[3] > 10 {
                personality.push_str("showing adequate capability in courtly schemes and political maneuvering");
            } else {
                personality.push_str(&format!("betraying limited capacity for the subtle arts of intrigue, leaving {} vulnerable to the machinations of more cunning rivals", objective));
            }

            personality.push_str(&format!(". {} intellectual and scholarly achievements, quantified at {}, ",
                possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], self.skills[4]));
            if self.skills[4] > 20 {
                personality.push_str(&format!("established {} as one of the great minds of the age—a scholar, intellectual, and learned individual whose understanding of law, theology, philosophy, and the sciences far exceeded that of {} contemporaries", objective, possessive));
            } else if self.skills[4] > 15 {
                personality.push_str("reflected impressive intellectual achievements and scholarly pursuits");
            } else if self.skills[4] > 10 {
                personality.push_str("indicated adequate education and intellectual capability");
            } else {
                personality.push_str(&format!("revealed limited intellectual development and scholarly accomplishment, marking {} as poorly educated by the standards of the ruling class", objective));
            }

            personality.push_str(&format!(". Finally, {} personal combat ability—distinct from strategic military command—scored {}, ",
                possessive, self.skills[5]));
            if self.skills[5] > 20 {
                personality.push_str(&format!("a rating that identified {} as a warrior of legendary skill, deadly with blade and lance, capable of cutting down multiple opponents in single combat. {} reputation as a fighter preceded {}, and few dared face {} in personal combat", objective, possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], objective, objective));
            } else if self.skills[5] > 15 {
                personality.push_str(&format!("marking {} as a formidable fighter skilled in the martial arts", objective));
            } else if self.skills[5] > 10 {
                personality.push_str(&format!("suggesting {} could hold {} own in a fight without being considered exceptional", pronoun.to_lowercase(), possessive));
            } else {
                personality.push_str(&format!("indicating {} was poorly suited for personal combat and vulnerable in any direct confrontation", pronoun.to_lowercase()));
            }

            personality.push_str(". ");
        }

        // Add linguistic abilities if notable
        if languages.len() > 2 {
            personality.push_str(&format!("Linguistically accomplished, {} was fluent in {} languages: {}. This polyglot ability facilitated communication across cultural boundaries and demonstrated considerable intellectual achievement",
                pronoun.to_lowercase(), languages.len(), languages.join(", ")));
            personality.push_str(". ");
        } else if languages.len() == 2 {
            personality.push_str(&format!("{} was bilingual, fluent in both {} and {}, a useful skill in a multicultural realm. ",
                pronoun, languages[0], languages[1]));
        }

        paragraphs.push(personality);

        // SECTION 3: Political Career, Rulership, and Governance - Comprehensive Account
        if !title_names.is_empty() {
            let mut political = String::new();

            political.push_str(&format!("The political career of {} represents a fascinating study in medieval power dynamics. ", self.name.as_ref()));

            // Comprehensive title description
            if title_names.len() == 1 {
                political.push_str(&format!("{} held the title of {}, wielding the authority and bearing the responsibilities that came with this singular position of power. {} reign over this domain defined {} political identity and legacy",
                    pronoun, title_names[0], possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], possessive));
            } else if title_names.len() == 2 {
                political.push_str(&format!("{} wore multiple crowns, reigning simultaneously as {} and {}. This dual authority required balancing the sometimes conflicting interests of different territories, managing separate administrative hierarchies, and maintaining legitimacy across culturally or geographically distinct domains",
                    pronoun, title_names[0], title_names[1]));
            } else if title_names.len() <= 5 {
                political.push_str(&format!("{} accumulated {} distinct titles: {}. Each title represented not merely nominal authority but actual territorial control, tax revenues, and vassal obligations. Managing this collection of domains demanded exceptional administrative capacity and political skill",
                    pronoun, title_names.len(), title_names.join(", ")));
            } else if title_names.len() <= 10 {
                political.push_str(&format!("{} amassed an impressive {} titles, including such prominent positions as {}, {}, and {}. This substantial collection of authorities represented one of the more significant concentrations of feudal power in the realm, requiring a vast administrative apparatus and constant political maneuvering to maintain",
                    pronoun, title_names.len(), title_names[0], title_names[1], title_names[2]));
            } else {
                political.push_str(&format!("{} accumulated an extraordinary {} separate titles, a staggering concentration of power unprecedented in scope. Among the most prestigious of these were {}, {}, {}, and {}. This vast empire of interlocking authorities and jurisdictions represented perhaps the pinnacle of feudal consolidation, transforming {} from mere ruler into something approaching an emperor in all but name. The sheer scale of {} dominions required a sophisticated bureaucratic machine, networks of loyal administrators, and constant attention to preventing the centrifugal forces that threatened to tear such sprawling holdings apart",
                    pronoun, title_names.len(), title_names[0], title_names[1], title_names[2],
                    if title_names.len() > 3 { &title_names[3] } else { &title_names[0] },
                    objective, possessive));
            }

            political.push_str(". ");

            // Comprehensive vassal analysis
            if vassal_count > 50 {
                political.push_str(&format!("The feudal pyramid beneath {} towered to extraordinary heights, with {} commanding the personal loyalty and feudal obligation of over {} direct vassals. This massive network of subordinate lords created a sprawling hierarchy of power, with each vassal controlling their own territories, maintaining their own sub-vassals, and providing military service and tax revenues upward through the feudal chain. Managing this vast web of relationships—mediating disputes between vassals, ensuring their loyalty, extracting their obligations while respecting their privileges—represented perhaps the primary challenge of {} reign. {} court must have been a constant swirl of petitions, complaints, ceremonies of homage, and political maneuvering as these dozens of powerful subordinates jockeyed for {} favor",
                    objective, pronoun.to_lowercase(), vassal_count, possessive, possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], possessive));
            } else if vassal_count > 20 {
                political.push_str(&format!("{} presided over a substantial feudal hierarchy, with {} direct vassals owing {} homage and service. This significant number of subordinate lords meant that {} realm was highly decentralized, with power delegated downward through layers of feudal obligation. Each vassal administered their own territories, raised their own troops, and exercised justice within their domains, while {} role involved coordinating these semi-autonomous powers, mediating their disputes, and ensuring their continued loyalty and service",
                    pronoun, vassal_count, objective, possessive, possessive));
            } else if vassal_count > 5 {
                political.push_str(&format!("Commanding {} vassals, {} maintained a moderately complex feudal structure. These subordinate lords provided military service, tax revenues, and administrative presence in their respective domains, while {} exercised overlordship, arbitrated their disputes, and ensured their continued allegiance. The relationship was reciprocal: they owed {} service and loyalty, while {} owed them protection, justice, and respect for their traditional privileges",
                    vassal_count, pronoun.to_lowercase(), pronoun.to_lowercase(), objective, pronoun.to_lowercase()));
            } else if vassal_count > 0 {
                political.push_str(&format!("With {} vassals, {} ruled a relatively centralized domain where power was less mediated through layers of feudal obligations. This more direct form of control allowed for greater coherence in policy but also meant {} personally bore more of the burden of administration and military leadership",
                    vassal_count, pronoun.to_lowercase(), pronoun.to_lowercase()));
            }

            political.push_str(". ");

            // Liege relationship - expanded detail
            if let Some(ref liege) = liege_name {
                political.push_str(&format!("Yet despite {} own considerable power and the vassals who served {}, {} was not a fully independent sovereign. {} remained bound by sacred feudal oath to {}, {} own overlord. This subordinate status created a complex political dynamic: {} possessed substantial autonomy within {} own domains, exercising royal or ducal prerogatives over {} own vassals and subjects, yet {} ultimately owed military service, counsel, and loyalty to a higher authority. This dual position—lord to some, vassal to another—typified the intricate web of medieval feudal relationships, where power was never absolute but always relational and contingent. {} relationship with {} liege must have required constant negotiation, balancing {} own interests and autonomy against {} feudal obligations and the potential consequences of defying {} overlord",
                    possessive, objective, pronoun.to_lowercase(), pronoun, liege, possessive,
                    pronoun.to_lowercase(), possessive, possessive, pronoun.to_lowercase(),
                    possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], possessive, possessive, possessive, possessive));
            } else if !title_names.is_empty() && vassal_count > 0 {
                political.push_str(&format!("{} ruled as an independent sovereign, acknowledging no earthly superior, beholden to no higher feudal authority. This status as supreme lord within {} realm—answering only to God, not to any king or emperor—granted {} complete autonomy in policy, the ability to conduct foreign relations as {} saw fit, and freedom from the obligations that bound most medieval rulers to overlords. This independence was both a source of immense power and a burden of sole responsibility: there was no higher authority to appeal to, no overlord to provide military support in times of crisis. {} stood alone at the apex of {} political world",
                    pronoun, possessive, objective, pronoun.to_lowercase(), pronoun, possessive));
            }

            political.push_str(". ");

            paragraphs.push(political);
        }

        // SECTION 4: Military Achievements, Wealth, Artifacts, and Renown - Comprehensive Accounting
        let mut achievements_section = String::new();

        // Military kills - detailed accounting
        if kill_count > 0 {
            achievements_section.push_str(&format!("The martial record of {} is written in blood. ", self.name.as_ref()));

            if kill_count >= 10 {
                achievements_section.push_str(&format!("{} personally slew {} individuals—an extraordinary tally of death that marked {} as one of the most lethal figures of the age. ",
                    pronoun, kill_count, objective));

                if !kill_victims.is_empty() {
                    if kill_victims.len() >= 5 {
                        achievements_section.push_str(&format!("Among {} victims were: {}. ",
                            possessive, kill_victims.join(", ")));
                    } else {
                        achievements_section.push_str(&format!("Notable among the fallen were {}.  ",
                            kill_victims.join(", ")));
                    }
                }

                achievements_section.push_str(&format!("Whether these deaths occurred in honorable combat on the battlefield, through judicial execution of condemned rebels, or via the darker arts of assassination and murder, the result was the same: {} removed {} enemies permanently from the political landscape. This willingness and ability to personally kill rivals and opponents—not merely ordering their deaths but taking direct action—established {} reputation as ruthless, deadly, and not to be trifled with. Contemporaries must have approached {} with considerable caution, knowing that offending {} could result in far more than mere political disadvantage",
                    pronoun.to_lowercase(), possessive, possessive, objective, objective));

            } else if kill_count >= 5 {
                achievements_section.push_str(&format!("{} claimed {} lives through personal action",
                    pronoun, kill_count));
                if !kill_victims.is_empty() {
                    achievements_section.push_str(&format!(", including {}", kill_victims.join(", ")));
                }
                achievements_section.push_str(&format!(". While not an unprecedented number, this record of killings nonetheless marked {} as someone willing and able to personally eliminate opponents, establishing {} credentials as a dangerous adversary",
                    objective, possessive));

            } else {
                achievements_section.push_str(&format!("{} personally killed {} {}",
                    pronoun, kill_count, if kill_count == 1 { "individual" } else { "individuals" }));
                if !kill_victims.is_empty() {
                    achievements_section.push_str(&format!("—{}", kill_victims.join(", ")));
                }
                achievements_section.push_str(&format!(". Whether this death{} occurred in battle, duel, execution, or assassination, the act of personally taking {} marked {} as willing to use lethal force to achieve {} objectives",
                    if kill_count == 1 { "" } else { "s" }, if kill_count == 1 { "a life" } else { "lives" }, objective, possessive));
            }

            achievements_section.push_str(". ");
        }

        // Prestige - comprehensive analysis
        if self.prestige > 100.0 {
            if self.prestige > 10000.0 {
                achievements_section.push_str(&format!("{} accumulated a staggering {:.0} prestige points over the course of {} lifetime—a number so astronomical as to defy easy comprehension and place {} among the most legendary figures in all of history. This prestige represented fame, honor, and reputation magnified to mythical proportions. {} name would have been known across continents, {} deeds celebrated in songs and stories, {} reputation preceding {} wherever {} traveled. Such monumental prestige could itself be wielded as a weapon: alliances were easier to forge, vassals more reluctant to rebel, and enemies more inclined toward negotiation when facing someone of such towering renown",
                    pronoun, self.prestige, possessive, objective, possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], possessive, possessive, objective, pronoun.to_lowercase()));
            } else if self.prestige > 5000.0 {
                achievements_section.push_str(&format!("With a prestige total of {:.0}, {} achieved legendary status even during {} own lifetime. This extraordinar renown—earned through great victories, noble deeds, impressive titles, or remarkable achievements—placed {} in the highest echelon of medieval celebrities. {} reputation extended far beyond {} immediate domains, making {} name recognized across vast distances and inspiring awe in those who heard of {} accomplishments",
                    self.prestige, pronoun.to_lowercase(), possessive, objective, possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], possessive, possessive, possessive));
            } else if self.prestige > 2000.0 {
                achievements_section.push_str(&format!("{} amassed {:.0} prestige, an impressive accumulation of renown that marked {} as a figure of exceptional accomplishment. This level of prestige opened doors, facilitated diplomacy, and commanded respect from peers. {} reputation for great deeds—whether in warfare, governance, piety, or other pursuits—preceded {}, shaping how others perceived and interacted with {}",
                    pronoun, self.prestige, objective, possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], objective, objective));
            } else if self.prestige > 1000.0 {
                achievements_section.push_str(&format!("Earning {:.0} prestige over {} lifetime, {} established a respectable reputation. This prestige reflected {} achievements and status, providing social capital that facilitated political and diplomatic endeavors",
                    self.prestige, possessive, pronoun.to_lowercase(), possessive));
            } else {
                achievements_section.push_str(&format!("With {:.0} prestige, {} possessed a modest degree of renown, sufficient for local recognition but hardly legendary in scope",
                    self.prestige, pronoun.to_lowercase()));
            }
            achievements_section.push_str(". ");
        }

        // Wealth - comprehensive analysis
        if self.gold > 100.0 {
            if self.gold > 10000.0 {
                achievements_section.push_str(&format!("{} treasury contained an astronomical {:.0} gold pieces at the time of {} death—wealth on a scale that boggled the medieval imagination. This was not merely money but power in its most liquid and versatile form. With such vast resources, {} could hire armies of mercenaries, fund ambitious construction projects, bribe potential enemies into alliance, and weather economic disasters that would bankrupt lesser rulers. The accumulation of such staggering riches testified to either exceptional administrative competence in extracting revenues, successful conquest and plunder, careful management over many years, or some combination thereof. This treasury represented generations of accumulated surplus, a buffer against calamity and a tool for ambitious enterprises",
                    possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], self.gold, possessive, pronoun.to_lowercase()));
            } else if self.gold > 5000.0 {
                achievements_section.push_str(&format!("The royal coffers bulged with {:.0} gold pieces, an impressive fortune that provided {} with considerable financial flexibility. This substantial wealth enabled major expenditures—wars could be funded, buildings erected, alliances purchased—without immediately bankrupting the realm. Such riches were both the fruit of successful rule and the means to future success",
                    self.gold, objective));
            } else if self.gold > 2000.0 {
                achievements_section.push_str(&format!("Possessing {:.0} gold in personal treasury, {} enjoyed comfortable financial circumstances. This money provided security against unexpected expenses and the capacity for moderate investments in military, construction, or political projects",
                    self.gold, pronoun.to_lowercase()));
            } else if self.gold > 500.0 {
                achievements_section.push_str(&format!("With {:.0} gold to {} name, {} maintained adequate financial resources for the basic functions of rulership, though major expenditures would strain this limited capital",
                    self.gold, possessive, pronoun.to_lowercase()));
            } else {
                achievements_section.push_str(&format!("The treasury held a modest {:.0} gold—enough for basic operations but hardly the vast riches that enabled grand ambitions. Financial limitations constrained {} options and forced careful prioritization of expenditures",
                    self.gold, possessive));
            }
            achievements_section.push_str(". ");
        }

        // Dread - comprehensive analysis
        if self.dread > 20.0 {
            if self.dread > 90.0 {
                achievements_section.push_str(&format!("Perhaps most terrifying of all, {} wielded a dread rating of {:.1}—a number representing absolute, paralyzing fear. {} very name became synonymous with terror; {} reputation for ruthless brutality, horrific punishments, and merciless cruelty preceded {} like a miasma of death. Vassals trembled in {} presence, potential rebels thought twice (or three times) before considering opposition, and even powerful foreign rulers approached {} with extreme caution. This overwhelming dread was both weapon and burden: it prevented opposition through sheer intimidation, but it also isolated {} in a prison of fear where genuine loyalty was impossible and every interaction was poisoned by terror. {} had created a realm united not by love or respect but by paralyzing fear of what {} might do to those who displeased {}",
                    pronoun.to_lowercase(), self.dread, possessive.chars().next().unwrap().to_uppercase().to_string() + &possessive[1..], possessive, objective, possessive, objective, objective, pronoun.to_lowercase(), pronoun.to_lowercase(), objective));
            } else if self.dread > 70.0 {
                achievements_section.push_str(&format!("{} cultivated a dread score of {:.1}, establishing a fearsome reputation for ruthlessness. This substantial fear factor helped maintain order—vassals and subjects hesitated to rebel when they knew cruel punishment might follow—but it also created an atmosphere of intimidation that could inhibit honest counsel and breed resentment beneath the surface compliance",
                    pronoun, self.dread));
            } else if self.dread > 50.0 {
                achievements_section.push_str(&format!("Maintaining a dread level of {:.1}, {} demonstrated a willingness to use fear as a tool of governance. This moderate intimidation factor helped discourage casual defiance without necessarily creating the overwhelming terror that characterized the most tyrannical rulers",
                    self.dread, pronoun.to_lowercase()));
            } else {
                achievements_section.push_str(&format!("With a dread rating of {:.1}, {} employed some degree of fear and intimidation in governance, though not to the extreme levels that defined truly terrifying rulers",
                    self.dread, pronoun.to_lowercase()));
            }
            achievements_section.push_str(". ");
        }

        // Piety - comprehensive analysis
        if self.piety > 100.0 {
            if self.piety > 5000.0 {
                achievements_section.push_str(&format!("{} achieved a piety score of {:.0}, numbers that approach sainthood in their magnitude. This extraordinary religious devotion—whether genuine faith or calculated performance or some mixture of both—established {} as a paragon of religious virtue in the eyes of the faith. The clergy blessed {}, the faithful venerated {}, and {} actions carried the weight of divine approval. Such monumental piety could be leveraged for political purposes: religious authorities were more likely to support {} causes, crusades or holy wars could be more easily proclaimed, and the faithful masses saw {} rule as blessed by God itself",
                    pronoun, self.piety, objective, objective, objective, possessive, possessive, possessive));
            } else if self.piety > 2000.0 {
                achievements_section.push_str(&format!("Demonstrating exceptional piety totaling {:.0}, {} earned recognition as a devout and righteous ruler. Whether through generous donations to the church, personal acts of religious devotion, participation in holy wars, or other demonstrations of faith, {} established strong credentials as a defender and exemplar of {} religion. This piety served both spiritual and practical purposes, earning divine favor while also strengthening {} relationship with religious authorities and pious subjects",
                    self.piety, pronoun.to_lowercase(), pronoun.to_lowercase(), possessive, possessive));
            } else if self.piety > 1000.0 {
                achievements_section.push_str(&format!("With {:.0} piety, {} maintained a respectable reputation for religious observance and devotion, fulfilling the spiritual expectations of {} position without necessarily standing out as exceptionally holy",
                    self.piety, pronoun.to_lowercase(), possessive));
            } else {
                achievements_section.push_str(&format!("Accumulating {:.0} piety, {} demonstrated a modest level of religious devotion—enough to avoid scandal but hardly approaching the extraordinary sanctity of the most pious rulers",
                    self.piety, pronoun.to_lowercase()));
            }
            achievements_section.push_str(". ");
        }

        // Artifacts - comprehensive inventory
        if !artifact_names.is_empty() {
            achievements_section.push_str(&format!("{} collected {} artifact{}: {}. ",
                pronoun, artifact_names.len(), if artifact_names.len() == 1 { "" } else { "s" },
                artifact_names.join(", ")));

            if artifact_names.len() >= 10 {
                achievements_section.push_str(&format!("This extraordinary assemblage of legendary objects represented one of the greatest artifact collections in the realm. Each piece carried its own history, powers, and symbolism, and together they formed a treasury of immense cultural, political, and potentially supernatural significance. The possession of such artifacts enhanced {} legitimacy, provided tangible connections to glorious predecessors or mythical heroes, and in some cases granted actual benefits to {} rule. Acquiring, maintaining, and displaying these treasures would have been a significant aspect of {} reign",
                    possessive, possessive, possessive));
            } else if artifact_names.len() >= 5 {
                achievements_section.push_str(&format!("This notable collection of artifacts enhanced {} prestige and legitimacy. Each relic or legendary item carried symbolic weight, connecting {} to heroic predecessors or representing divine favor. Such treasures were not mere decorations but tools of political and spiritual power",
                    possessive, objective));
            } else if artifact_names.len() > 1 {
                achievements_section.push_str(&format!("These artifacts served as symbols of {} power and legitimacy, each carrying its own significance and history",
                    possessive));
            } else {
                achievements_section.push_str(&format!("This singular artifact served as a powerful symbol of {} authority and connection to glorious traditions",
                    possessive));
            }
            achievements_section.push_str(". ");
        }

        // Life events / memories
        if memory_count > 20 {
            achievements_section.push_str(&format!("The chronicles record {} significant life events and memories that shaped {} existence—an extraordinary number suggesting a life packed with incident, drama, and historical significance. Each of these events—whether triumphs or tragedies, personal milestones or political turning points—contributed to the complex tapestry of {} story",
                memory_count, possessive, possessive));
            achievements_section.push_str(". ");
        } else if memory_count > 10 {
            achievements_section.push_str(&format!("Throughout {} life, {} experienced {} notable events of sufficient significance to be recorded and remembered. These milestones marked the key moments that defined {} reign and character",
                possessive, pronoun.to_lowercase(), memory_count, possessive));
            achievements_section.push_str(". ");
        }

        if !achievements_section.is_empty() {
            paragraphs.push(achievements_section);
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
