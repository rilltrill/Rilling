use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    ops::Deref,
    path::{Path, PathBuf},
    thread,
};

use derive_more::From;
use minijinja::{Environment, Value};

use serde::Serialize;

use super::{
    super::{
        game_data::{GameData, Localize},
        save_file::{
            parser::types::{GameId, Wrapper, WrapperMut},
            structures::{
                Character, Culture, Dynasty, EntityRef, Faith, FromGameObject, GameObjectDerived,
                GameObjectEntity, GameRef, House, Player, Title,
            },
            GameState,
        },
    },
    graph::Grapher,
    timeline::Timeline,
};

impl Localize<String> for Value {
    fn lookup<K: AsRef<str>>(&self, key: K) -> Option<String> {
        self.get_attr(key.as_ref())
            .ok()
            .map(|x| x.as_str().and_then(|x| Some(x.to_string())))
            .flatten()
    }

    fn is_empty(&self) -> bool {
        self.is_none()
    }
}

/// A convenience function to create a directory if it doesn't exist, and do nothing if it does.
/// Also prints an error message if the directory creation fails.
fn create_dir_maybe<P: AsRef<Path>>(name: P) {
    if let Err(err) = fs::create_dir_all(name) {
        if err.kind() != std::io::ErrorKind::AlreadyExists {
            println!("Failed to create folder: {}", err);
        }
    }
}

#[derive(From)]
enum RenderableType {
    Character(GameRef<Character>),
    Dynasty(GameRef<Dynasty>),
    House(GameRef<House>),
    Title(GameRef<Title>),
    Faith(GameRef<Faith>),
    Culture(GameRef<Culture>),
}

impl TryFrom<&EntityRef> for RenderableType {
    type Error = ();

    fn try_from(value: &EntityRef) -> Result<Self, Self::Error> {
        match value {
            EntityRef::Character(c) => Ok(c.clone().into()),
            EntityRef::Dynasty(d) => Ok(d.clone().into()),
            EntityRef::House(h) => Ok(h.clone().into()),
            EntityRef::Title(t) => Ok(t.clone().into()),
            EntityRef::Faith(f) => Ok(f.clone().into()),
            EntityRef::Culture(c) => Ok(c.clone().into()),
            _ => Err(()),
        }
    }
}

impl RenderableType {
    fn get_id(&self) -> GameId {
        match self {
            RenderableType::Character(c) => c.get_internal().get_id(),
            RenderableType::Dynasty(d) => d.get_internal().get_id(),
            RenderableType::House(h) => h.get_internal().get_id(),
            RenderableType::Title(t) => t.get_internal().get_id(),
            RenderableType::Faith(f) => f.get_internal().get_id(),
            RenderableType::Culture(c) => c.get_internal().get_id(),
        }
    }

    const fn get_subdir(&self) -> &'static str {
        match self {
            RenderableType::Character(_) => Character::SUBDIR,
            RenderableType::Dynasty(_) => Dynasty::SUBDIR,
            RenderableType::House(_) => House::SUBDIR,
            RenderableType::Title(_) => Title::SUBDIR,
            RenderableType::Faith(_) => Faith::SUBDIR,
            RenderableType::Culture(_) => Culture::SUBDIR,
        }
    }

    fn is_initialized(&self) -> bool {
        match self {
            RenderableType::Character(c) => c.get_internal().inner().is_some(),
            RenderableType::Dynasty(d) => d.get_internal().inner().is_some(),
            RenderableType::House(h) => h.get_internal().inner().is_some(),
            RenderableType::Title(t) => t.get_internal().inner().is_some(),
            RenderableType::Faith(f) => f.get_internal().inner().is_some(),
            RenderableType::Culture(c) => c.get_internal().inner().is_some(),
        }
    }
}

#[derive(From)]
pub enum EntryPoint<'a> {
    Player(&'a Player),
    Timeline(&'a Timeline),
}

/// A struct that renders objects into html pages.
/// It is meant to be used as a worker object that collects objects and renders them all at once.
/// The objects are rendered in a BFS order, with the depth of the objects being determined by the BFS algorithm.
pub struct Renderer<'a> {
    roots: Vec<EntryPoint<'a>>,
    depth_map: HashMap<EntityRef, usize>,
    /// The path where the objects will be rendered to.
    /// This usually takes the form of './{username}'s history/'.
    path: &'a Path,
    /// The loaded game data object.
    data: &'a GameData,
    /// The grapher object, if it exists.
    /// It may be utilized during the rendering process to render a variety of graphs.
    grapher: Option<&'a Grapher>,
    /// The game state object.
    /// It is used to access the game state during rendering, especially for gathering of data for rendering of optional graphs.
    state: &'a GameState,
    initial_depth: usize,
}

impl<'a> Renderer<'a> {
    /// Create a new Renderer.
    /// The Renderer will ensure that the directory exists, and the subdirectories are created.
    ///
    /// # Arguments
    ///
    /// * `path` - The root path where the objects will be rendered to. Usually takes the form of './{username}'s history/'.
    /// * `state` - The game state object.
    /// * `game_map` - The game map object, if it exists.
    /// * `grapher` - The grapher object, if it exists.
    /// * `initial_depth` - The initial depth of the objects that are added to the renderer.
    ///
    /// # Returns
    ///
    /// A new Renderer object.
    pub fn new(
        path: &'a Path,
        state: &'a GameState,
        data: &'a GameData,
        grapher: Option<&'a Grapher>,
        initial_depth: usize,
    ) -> Self {
        create_dir_maybe(path);
        create_dir_maybe(path.join(Character::SUBDIR));
        create_dir_maybe(path.join(Dynasty::SUBDIR));
        create_dir_maybe(path.join(Title::SUBDIR));
        create_dir_maybe(path.join(Faith::SUBDIR));
        create_dir_maybe(path.join(Culture::SUBDIR));
        create_dir_maybe(path.join(House::SUBDIR));
        Renderer {
            roots: Vec::new(),
            depth_map: HashMap::default(),
            path,
            data,
            grapher,
            state,
            initial_depth,
        }
    }

    /// Renders the [Renderable] object.
    fn render<T: Renderable, D: Deref<Target = T>>(&self, obj: D, env: &Environment<'_>) {
        //render the object
        let template = match env.get_template(T::TEMPLATE_NAME) {
            Ok(t) => t,
            Err(e) => {
                eprintln!("Warning: Failed to get template {}: {}", T::TEMPLATE_NAME, e);
                return;
            }
        };
        let path = obj.get_path(self.path);
        obj.render(&self.path, &self.state, self.grapher, self.data);
        let contents = match template.render(obj.deref()) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Warning: Failed to render {}: {}. Skipping this entity.", T::TEMPLATE_NAME, e);
                return;
            }
        };
        thread::spawn(move || {
            //IO heavy, so spawn a thread
            if let Err(e) = fs::write(&path, contents) {
                eprintln!("Warning: Failed to write file {:?}: {}", path, e);
            }
        });
    }

    /// Renders the [RenderableType] object.
    fn render_enum(&self, obj: &RenderableType, env: &Environment<'_>) {
        if !obj.is_initialized() {
            return;
        }
        match obj {
            RenderableType::Character(obj) => self.render(obj.get_internal(), env),
            RenderableType::Dynasty(obj) => self.render(obj.get_internal(), env),
            RenderableType::House(obj) => self.render(obj.get_internal(), env),
            RenderableType::Title(obj) => self.render(obj.get_internal(), env),
            RenderableType::Faith(obj) => self.render(obj.get_internal(), env),
            RenderableType::Culture(obj) => self.render(obj.get_internal(), env),
        }
    }

    /// Adds an object to the renderer, and returns the number of objects that were added.
    /// This method uses a BFS algorithm to determine the depth of the object.
    pub fn add_object<G: GameObjectDerived + Renderable>(&mut self, obj: &'a G) -> usize
    where
        EntryPoint<'a>: From<&'a G>,
    {
        self.roots.push(EntryPoint::from(obj));
        // BFS with depth https://stackoverflow.com/a/31248992/12520385
        let mut queue: VecDeque<Option<EntityRef>> = VecDeque::new();
        obj.get_references(&mut queue);
        let mut res = queue.len();
        queue.push_back(None);
        // algorithm determined depth
        let mut alg_depth = self.initial_depth;
        while let Some(obj) = queue.pop_front() {
            res += 1;
            if let Some(obj) = obj {
                if let Some(stored_depth) = self.depth_map.get_mut(&obj) {
                    if alg_depth > *stored_depth {
                        *stored_depth = alg_depth;
                        obj.get_references(&mut queue);
                    }
                } else {
                    obj.get_references(&mut queue);
                    self.depth_map.insert(obj, alg_depth);
                }
            } else {
                alg_depth -= 1;
                if alg_depth == 0 {
                    break;
                }
                queue.push_back(None);
                if queue.front().map(|f| f.is_none()).unwrap_or(true) {
                    break;
                }
            }
        }
        return res;
    }

    /// Renders all the objects that have been added to the renderer.
    /// This method consumes the renderer object.
    ///
    /// # Arguments
    ///
    /// * `env` - The [Environment] object that is used to render the templates.
    ///
    /// # Returns
    ///
    /// The number of objects that were rendered.
    pub fn render_all(self, env: &mut Environment<'_>) -> usize {
        let mut global_depth_map: HashMap<&'static str, HashMap<GameId, usize>> =
            HashMap::default();
        for (obj, value) in self.depth_map.iter() {
            if let Ok(obj) = RenderableType::try_from(obj) {
                global_depth_map
                    .entry(obj.get_subdir())
                    .or_insert(HashMap::default())
                    .insert(obj.get_id(), *value);
            }
        }
        env.add_global("depth_map", Value::from_serialize(global_depth_map));

        // Collect all character IDs from player lineages to limit narrative generation
        let mut player_lineage_chars: HashSet<GameId> = HashSet::new();
        for root in &self.roots {
            if let EntryPoint::Player(player) = root {
                // Get the player's lineage characters
                for lineage_node in player.get_lineage() {
                    let char_id = lineage_node.get_character().get_internal().get_id();
                    player_lineage_chars.insert(char_id);
                }
            }
        }

        // Generate narratives ONLY for characters in the player's lineage
        // Do this in two passes to avoid RefCell borrow conflicts:
        // Pass 1: Generate all narratives (immutable borrows)
        // Pass 2: Set all narratives (mutable borrows)
        if player_lineage_chars.is_empty() {
            eprintln!("No player lineage found - skipping narrative generation");
        } else {
            eprintln!("Generating narratives for {} characters in player lineage...", player_lineage_chars.len());
            let mut narratives: HashMap<GameId, Vec<String>> = HashMap::new();
            let mut generated_count = 0;
            let mut error_count = 0;
            for obj in self.depth_map.keys() {
                if let EntityRef::Character(character) = obj {
                    let char_id = character.get_internal().get_id();

                    // Only generate narratives for characters in the player's lineage
                    if !player_lineage_chars.contains(&char_id) {
                        continue;
                    }

                    // Try to generate narrative, catching any panics
                    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                        if let Some(internal) = character.get_internal().inner() {
                            internal.generate_narrative()
                        } else {
                            Vec::new()
                        }
                    }));

                    match result {
                        Ok(narrative) => {
                            if !narrative.is_empty() {
                                narratives.insert(char_id, narrative);
                                generated_count += 1;
                            }
                        }
                        Err(_) => {
                            error_count += 1;
                            // Skip this character's narrative if there's an error
                        }
                    }
                }
            }

            // Pass 2: Set all the narratives
            let mut set_count = 0;
            let mut set_error_count = 0;
            for (id, narrative) in narratives {
                // Find the character and set its narrative
                if let Some(character) = self.state.get_characters().get(&id) {
                    // Use try_get_internal_mut to handle RefCell borrow errors gracefully
                    match character.try_get_internal_mut() {
                        Ok(mut game_obj) => {
                            if let Some(internal) = game_obj.inner_mut() {
                                internal.set_narrative(narrative);
                                set_count += 1;
                            }
                        }
                        Err(_) => {
                            set_error_count += 1;
                            // Skip this character if we can't get mutable access
                            // This can happen if the character is borrowed elsewhere
                        }
                    }
                }
            }
            eprintln!("Generated {} narratives ({} errors skipped)", generated_count, error_count);
            eprintln!("Set {} narratives on characters ({} skipped due to borrow conflicts)", set_count, set_error_count);
        }

        for root in &self.roots {
            match root {
                EntryPoint::Player(p) => self.render(*p, env),
                EntryPoint::Timeline(t) => self.render(*t, env),
            }
        }
        for obj in self.depth_map.keys() {
            if let Ok(obj) = obj.try_into() {
                self.render_enum(&obj, env);
            }
        }
        env.remove_global("depth_map");
        return self.depth_map.len();
    }
}

/// An object whose rendered output is meant to be placed in a certain subdirectory.
/// [GameObjectDerived], [FromGameObject] structs that implement this, will
/// have [GetPath] implemented automatically.
pub trait ProceduralPath {
    const SUBDIR: &'static str;
}

/// An object whose rendered output is meant to be placed at a specific path.
pub trait GetPath {
    fn get_path(&self, path: &Path) -> PathBuf;
}

impl<T: GameObjectDerived + ProceduralPath + FromGameObject> GetPath for GameObjectEntity<T> {
    fn get_path(&self, path: &Path) -> PathBuf {
        let mut buf = path.join(T::SUBDIR);
        buf.push(self.get_id().to_string() + ".html");
        buf
    }
}

/// Trait for objects that can be rendered into a html page.
/// Since this uses [minijinja] the [serde::Serialize] trait is also needed.
/// Each object that implements this trait should have a corresponding template file in the templates folder.
pub trait Renderable: Serialize + GetPath {
    /// Used to retrieve the template from the [Environment] object in the [Renderer] object
    const TEMPLATE_NAME: &'static str;

    /// Renders all the objects that are related to this object.
    /// For example: graphs, maps, etc.
    /// This is where your custom rendering logic should go.
    ///
    /// # Arguments
    ///
    /// * `path` - The root output path of the renderer.
    /// * `game_state` - The game state object.
    /// * `grapher` - The grapher object, if it exists.
    /// * `data` - The game data object.
    ///
    /// # Default Implementation
    ///
    /// The default implementation does nothing. It is up to the implementing object to override this method.
    #[allow(unused_variables)]
    fn render(
        &self,
        path: &Path,
        game_state: &GameState,
        grapher: Option<&Grapher>,
        data: &GameData,
    ) {
    }
}
