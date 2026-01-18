use super::{
    super::{
        super::game_data::{GameData, Localizable, LocalizationError},
        game_state::GameState,
        parser::{types::GameString, GameObjectMap, GameObjectMapping, ParsingError},
    },
    Character, EntityRef, FromGameObject, GameObjectDerived, GameRef, LineageNode,
};

/// A struct representing a player in the game
#[cfg_attr(feature = "serde", derive(serde::Serialize))]
pub struct Player {
    name: GameString,
    character: Option<GameRef<Character>>,
    lineage: Vec<LineageNode>,
}

impl FromGameObject for Player {
    fn from_game_object(
        base: &GameObjectMap,
        game_state: &mut GameState,
    ) -> Result<Self, ParsingError> {
        let mut player = Self {
            name: base.get_string("name")?,
            character: Some(
                game_state
                    .get_character(&base.get_game_id("character")?)
                    .clone(),
            ),
            lineage: Vec::new(),
        };
        for leg in base.get_object("legacy")?.as_array()? {
            player.lineage.push(LineageNode::from_game_object(
                leg.as_object()?.as_map()?,
                game_state,
            )?)
        }
        Ok(player)
    }
}

impl GameObjectDerived for Player {
    fn get_name(&self) -> GameString {
        self.name.clone()
    }

    fn get_references<E: From<EntityRef>, C: Extend<E>>(&self, collection: &mut C) {
        if let Some(character) = self.character.as_ref() {
            collection.extend([E::from(character.clone().into())]);
        }
        for node in self.lineage.iter() {
            collection.extend([E::from(node.get_character().clone().into())]);
        }
    }
}

impl Localizable for Player {
    fn localize(&mut self, localization: &GameData) -> Result<(), LocalizationError> {
        for node in self.lineage.iter_mut() {
            node.localize(localization)?;
        }
        Ok(())
    }
}

#[cfg(feature = "display")]
mod display {
    use super::super::super::{
        super::{
            display::{GetPath, Grapher, Renderable},
            game_data::{MapGenerator, MapImage},
        },
        parser::types::Wrapper,
    };
    use super::*;

    use std::{
        collections::HashSet,
        fs::File,
        ops::Deref,
        path::{Path, PathBuf},
    };

    use image::{
        buffer::ConvertBuffer,
        codecs::gif::{GifEncoder, Repeat},
        Delay, Frame, Rgb,
    };
    use jomini::common::PdsDate;

    const TARGET_COLOR: Rgb<u8> = Rgb([70, 255, 70]);
    const SECONDARY_COLOR: Rgb<u8> = Rgb([255, 255, 70]);
    const BASE_COLOR: Rgb<u8> = Rgb([255, 255, 255]);

    impl GetPath for Player {
        fn get_path(&self, path: &Path) -> PathBuf {
            path.join("index.html")
        }
    }

    impl Renderable for Player {
        const TEMPLATE_NAME: &'static str = "homeTemplate";

        fn render(
            &self,
            path: &Path,
            game_state: &GameState,
            grapher: Option<&Grapher>,
            data: &GameData,
        ) {
            if let Some(map) = data.get_map() {
                //timelapse rendering
                let mut file = match File::create(path.join("timelapse.gif")) {
                    Ok(f) => f,
                    Err(e) => {
                        eprintln!("Warning: Failed to create timelapse.gif: {}", e);
                        return;
                    }
                };
                let mut gif_encoder = GifEncoder::new(&mut file);
                for char in self.lineage.iter() {
                    /* Note on timelapse:
                    Paradox doesn't save any data regarding top level liege changes.
                    Not even basic data that would allow us to reconstruct the map through implication.
                    We would need something as basic as adding liege changes to history, or even just storing dead character's vassal relations
                    I once had an idea that it could be possible to still have a timelapse by looking at dead vassals of the children of chars in lineage
                    But that idea got stuck at the recursive step of that algorithm, and even so the result would have NO accuracy
                     */
                    if let Some(char) = char.get_character().get_internal().inner() {
                        //we get the provinces held by the character and the vassals who died under their reign.
                        //This is the closes approximation we can get of changes in the map that are 100% accurate
                        let death_date = char.get_death_date();
                        let date = if let Some(death_date) = &death_date {
                            format!("{}", death_date.iso_8601())
                        } else if let Some(current_date) = game_state.get_current_date() {
                            format!("{}", current_date.iso_8601())
                        } else {
                            "Unknown Date".to_string()
                        };
                        let mut barony_map =
                            map.create_map_flat(char.get_barony_keys(true), TARGET_COLOR);
                        barony_map.draw_text(date.to_string());
                        let fbytes = barony_map.convert();
                        //these variables cuz fbytes is moved
                        let width = fbytes.width();
                        let height = fbytes.height();
                        let frame = Frame::from_parts(
                            fbytes,
                            width,
                            height,
                            Delay::from_numer_denom_ms(3000, 1),
                        );
                        if let Err(e) = gif_encoder.encode_frame(frame) {
                            eprintln!("Warning: Failed to encode gif frame: {}", e);
                        }
                    }
                }
                if let Err(e) = gif_encoder.set_repeat(Repeat::Infinite) {
                    eprintln!("Warning: Failed to set gif repeat: {}", e);
                }
                let mut direct_titles = HashSet::new();
                let mut descendant_title = HashSet::new();
                if let Some(first_node) = self.lineage.first() {
                    let first_char = first_node.get_character();
                    let first_internal = first_char.get_internal();
                    if let Some(first) = first_internal.inner() {
                        if let Some(dynasty_ref) = first.get_house() {
                            let dynasty = dynasty_ref.get_internal();
                            if let Some(dynasty_inner) = dynasty.inner() {
                                let founder_ref = dynasty_inner.get_founder();
                                let founder_internal = founder_ref.get_internal();
                                if let Some(founder_inner) = founder_internal.inner() {
                                    for desc in founder_inner.get_descendants() {
                                        if let Some(desc) = desc.get_internal().inner() {
                                            if desc.get_death_date().is_some() {
                                                continue;
                                            }
                                            let target = if desc.get_house().map_or(false, |d| {
                                                if let Some(desc_house) = d.get_internal().inner() {
                                                    if let Some(dynasty_inner_cmp) = dynasty.inner() {
                                                        desc_house.get_dynasty().get_internal().deref()
                                                            == dynasty_inner_cmp.get_dynasty().get_internal().deref()
                                                    } else {
                                                        false
                                                    }
                                                } else {
                                                    false
                                                }
                                            }) {
                                                &mut direct_titles
                                            } else {
                                                &mut descendant_title
                                            };
                                            for title in desc.get_barony_keys(false) {
                                                target.insert(title.clone());
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                let mut dynasty_map = map.create_map::<_, _, Vec<GameString>>(
                    |key: &str| {
                        if direct_titles.contains(key) {
                            return TARGET_COLOR;
                        } else if descendant_title.contains(key) {
                            return SECONDARY_COLOR;
                        } else {
                            return BASE_COLOR;
                        }
                    },
                    None,
                );
                dynasty_map.draw_legend([
                    ("Dynastic titles".to_string(), TARGET_COLOR),
                    ("Descendant titles".to_string(), SECONDARY_COLOR),
                ]);
                dynasty_map.save_in_thread(path.join("dynastyMap.png"));
            }
            if let Some(grapher) = grapher {
                if let Some(last_node) = self.lineage.last() {
                    let last = last_node.get_character();
                    grapher.create_tree_graph(last, true, &path.join("line.svg"));
                }
            }
        }
    }
}
