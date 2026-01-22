use crate::save_file::{
    GameState,
    structures::{Character, GameObjectDerived},
    parser::types::Wrapper,
};
use jomini::common::PdsDate;
use std::collections::HashMap;

/// Search results for a character query
#[derive(Debug)]
pub struct SearchResult {
    pub id: u64,
    pub name: String,
    pub culture: Option<String>,
    pub faith: Option<String>,
    pub house: Option<String>,
    pub birth_year: i32,
    pub dead: bool,
    pub death_year: Option<i32>,
    pub prestige: f32,
    pub gold: f32,
    pub piety: f32,
    pub dread: f32,
    pub traits: Vec<String>,
    pub titles: Vec<String>,
    pub skills: Vec<i8>,
}

/// Search filters for querying characters
#[derive(Debug, Default)]
pub struct SearchFilters {
    pub name: Option<String>,
    pub culture: Option<String>,
    pub faith: Option<String>,
    pub house: Option<String>,
    pub traits: Vec<String>,
    pub min_prestige: Option<f32>,
    pub min_gold: Option<f32>,
    pub living_only: bool,
    pub dead_only: bool,
}

impl SearchFilters {
    /// Check if a character matches all the search filters
    fn matches(&self, result: &SearchResult) -> bool {
        // Name filter (case-insensitive partial match)
        if let Some(ref name_filter) = self.name {
            if !result.name.to_lowercase().contains(&name_filter.to_lowercase()) {
                return false;
            }
        }

        // Culture filter (exact match, case-insensitive)
        if let Some(ref culture_filter) = self.culture {
            match &result.culture {
                Some(culture) => {
                    if culture.to_lowercase() != culture_filter.to_lowercase() {
                        return false;
                    }
                }
                None => return false,
            }
        }

        // Faith filter (exact match, case-insensitive)
        if let Some(ref faith_filter) = self.faith {
            match &result.faith {
                Some(faith) => {
                    if faith.to_lowercase() != faith_filter.to_lowercase() {
                        return false;
                    }
                }
                None => return false,
            }
        }

        // House filter (partial match, case-insensitive)
        if let Some(ref house_filter) = self.house {
            match &result.house {
                Some(house) => {
                    if !house.to_lowercase().contains(&house_filter.to_lowercase()) {
                        return false;
                    }
                }
                None => return false,
            }
        }

        // Traits filter (must have ALL specified traits)
        if !self.traits.is_empty() {
            let char_traits_lower: Vec<String> = result.traits.iter()
                .map(|t| t.to_lowercase())
                .collect();

            for required_trait in &self.traits {
                if !char_traits_lower.contains(&required_trait.to_lowercase()) {
                    return false;
                }
            }
        }

        // Prestige filter
        if let Some(min_prestige) = self.min_prestige {
            if result.prestige < min_prestige {
                return false;
            }
        }

        // Gold filter
        if let Some(min_gold) = self.min_gold {
            if result.gold < min_gold {
                return false;
            }
        }

        // Living/dead filters
        if self.living_only && result.dead {
            return false;
        }
        if self.dead_only && !result.dead {
            return false;
        }

        true
    }
}

/// Search characters in the game state based on filters
pub fn search_characters(game_state: &GameState, filters: &SearchFilters) -> Vec<SearchResult> {
    let mut results = Vec::new();

    // Iterate through all characters in the game state
    for (id, char_ref) in game_state.get_characters() {
        if let Some(character) = char_ref.get_internal().inner() {
            // Extract character data
            let result = SearchResult {
                id: *id as u64,
                name: character.get_name().to_string(),
                culture: character.get_culture()
                    .and_then(|c| c.get_internal().inner().map(|x| x.get_name().to_string())),
                faith: character.get_faith()
                    .and_then(|f| f.get_internal().inner().map(|x| x.get_name().to_string())),
                house: character.get_house()
                    .and_then(|h| h.get_internal().inner().map(|x| x.get_name().to_string())),
                birth_year: character.get_birth().year() as i32,
                dead: character.is_dead(),
                death_year: character.get_death_date().map(|d| d.year() as i32),
                prestige: character.get_prestige(),
                gold: character.get_gold(),
                piety: character.get_piety(),
                dread: character.get_dread(),
                traits: character.get_traits().iter().map(|t| t.to_string()).collect(),
                titles: character.get_titles().iter()
                    .filter_map(|t| t.get_internal().inner().map(|x| x.get_name().to_string()))
                    .collect(),
                skills: character.get_skills().to_vec(),
            };

            // Check if character matches filters
            if filters.matches(&result) {
                results.push(result);
            }
        }
    }

    results
}

/// Format search results as human-readable text
pub fn format_results_text(results: &[SearchResult]) -> String {
    let mut output = String::new();

    output.push_str(&format!("Found {} matching character(s):\n\n", results.len()));

    for (i, result) in results.iter().enumerate() {
        output.push_str(&format!("{}. {} (ID: {})\n", i + 1, result.name, result.id));

        if let Some(ref culture) = result.culture {
            output.push_str(&format!("   Culture: {}\n", culture));
        }
        if let Some(ref faith) = result.faith {
            output.push_str(&format!("   Faith: {}\n", faith));
        }
        if let Some(ref house) = result.house {
            output.push_str(&format!("   House: {}\n", house));
        }

        output.push_str(&format!("   Born: {}", result.birth_year));
        if result.dead {
            if let Some(death_year) = result.death_year {
                output.push_str(&format!(", Died: {} (Age: {})", death_year, death_year - result.birth_year));
            } else {
                output.push_str(", Died: Unknown year");
            }
        } else {
            output.push_str(" (Living)");
        }
        output.push('\n');

        if !result.titles.is_empty() {
            output.push_str(&format!("   Titles: {}\n", result.titles.join(", ")));
        }

        output.push_str(&format!("   Stats: Prestige={:.0}, Gold={:.0}, Piety={:.0}, Dread={:.0}\n",
            result.prestige, result.gold, result.piety, result.dread));

        if !result.traits.is_empty() {
            output.push_str(&format!("   Traits: {}\n", result.traits.join(", ")));
        }

        output.push('\n');
    }

    output
}

/// Format search results as detailed text with all information
pub fn format_results_detailed(results: &[SearchResult]) -> String {
    let mut output = String::new();

    output.push_str(&format!("Found {} matching character(s):\n\n", results.len()));
    output.push_str(&"=".repeat(80));
    output.push('\n');

    for (i, result) in results.iter().enumerate() {
        output.push_str(&format!("\n{}. {} (ID: {})\n", i + 1, result.name, result.id));
        output.push_str(&"-".repeat(80));
        output.push('\n');

        // Basic info
        output.push_str(&format!("Culture: {}\n", result.culture.as_ref().unwrap_or(&"Unknown".to_string())));
        output.push_str(&format!("Faith: {}\n", result.faith.as_ref().unwrap_or(&"Unknown".to_string())));
        output.push_str(&format!("House: {}\n", result.house.as_ref().unwrap_or(&"None".to_string())));

        // Dates
        output.push_str(&format!("Born: {}\n", result.birth_year));
        if result.dead {
            if let Some(death_year) = result.death_year {
                output.push_str(&format!("Died: {} (Age: {})\n", death_year, death_year - result.birth_year));
            } else {
                output.push_str("Died: Unknown year\n");
            }
        } else {
            output.push_str("Status: Living\n");
        }

        // Titles
        if !result.titles.is_empty() {
            output.push_str(&format!("Titles ({}):\n", result.titles.len()));
            for title in &result.titles {
                output.push_str(&format!("  - {}\n", title));
            }
        } else {
            output.push_str("Titles: None\n");
        }

        // Stats
        output.push_str(&format!("\nStatistics:\n"));
        output.push_str(&format!("  Prestige: {:.0}\n", result.prestige));
        output.push_str(&format!("  Gold: {:.0}\n", result.gold));
        output.push_str(&format!("  Piety: {:.0}\n", result.piety));
        output.push_str(&format!("  Dread: {:.0}\n", result.dread));

        // Skills
        if result.skills.len() >= 6 {
            output.push_str(&format!("\nSkills:\n"));
            let skill_names = ["Diplomacy", "Martial", "Stewardship", "Intrigue", "Learning", "Prowess"];
            for (idx, &skill) in result.skills.iter().enumerate().take(6) {
                output.push_str(&format!("  {}: {}\n", skill_names[idx], skill));
            }
        }

        // Traits
        if !result.traits.is_empty() {
            output.push_str(&format!("\nTraits ({}):\n", result.traits.len()));
            output.push_str(&format!("  {}\n", result.traits.join(", ")));
        }

        output.push('\n');
    }

    output.push_str(&"=".repeat(80));
    output.push('\n');

    output
}

/// Format search results as JSON
pub fn format_results_json(results: &[SearchResult]) -> String {
    // Simple JSON formatting without external dependencies
    let mut output = String::from("[\n");

    for (i, result) in results.iter().enumerate() {
        if i > 0 {
            output.push_str(",\n");
        }

        output.push_str("  {\n");
        output.push_str(&format!("    \"id\": {},\n", result.id));
        output.push_str(&format!("    \"name\": \"{}\",\n", result.name.replace("\"", "\\\"")));

        if let Some(ref culture) = result.culture {
            output.push_str(&format!("    \"culture\": \"{}\",\n", culture.replace("\"", "\\\"")));
        } else {
            output.push_str("    \"culture\": null,\n");
        }

        if let Some(ref faith) = result.faith {
            output.push_str(&format!("    \"faith\": \"{}\",\n", faith.replace("\"", "\\\"")));
        } else {
            output.push_str("    \"faith\": null,\n");
        }

        if let Some(ref house) = result.house {
            output.push_str(&format!("    \"house\": \"{}\",\n", house.replace("\"", "\\\"")));
        } else {
            output.push_str("    \"house\": null,\n");
        }

        output.push_str(&format!("    \"birth_year\": {},\n", result.birth_year));
        output.push_str(&format!("    \"dead\": {},\n", result.dead));

        if let Some(death_year) = result.death_year {
            output.push_str(&format!("    \"death_year\": {},\n", death_year));
        } else {
            output.push_str("    \"death_year\": null,\n");
        }

        output.push_str(&format!("    \"prestige\": {:.2},\n", result.prestige));
        output.push_str(&format!("    \"gold\": {:.2},\n", result.gold));
        output.push_str(&format!("    \"piety\": {:.2},\n", result.piety));
        output.push_str(&format!("    \"dread\": {:.2},\n", result.dread));

        output.push_str("    \"traits\": [");
        for (j, trait_name) in result.traits.iter().enumerate() {
            if j > 0 {
                output.push_str(", ");
            }
            output.push_str(&format!("\"{}\"", trait_name.replace("\"", "\\\"")));
        }
        output.push_str("],\n");

        output.push_str("    \"titles\": [");
        for (j, title) in result.titles.iter().enumerate() {
            if j > 0 {
                output.push_str(", ");
            }
            output.push_str(&format!("\"{}\"", title.replace("\"", "\\\"")));
        }
        output.push_str("],\n");

        output.push_str("    \"skills\": [");
        for (j, &skill) in result.skills.iter().enumerate() {
            if j > 0 {
                output.push_str(", ");
            }
            output.push_str(&format!("{}", skill));
        }
        output.push_str("]\n");

        output.push_str("  }");
    }

    output.push_str("\n]\n");
    output
}
