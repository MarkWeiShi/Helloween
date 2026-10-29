# Cultural content and source notes

Content version: **2**, English. Prepared for the 2026 Halloween release. This is a source-informed editorial implementation, not evidence of completed native-speaker, cultural-community, or final-art acceptance.

## What is traditional, and what is original

- `folklore` contains a short paraphrased account of a documented figure or tradition. `sources` links to the evidence used for that account.
- `wish` and every `story` panel are newly written festival fiction. They must appear under **Our Halloween tale**, visibly separate from **In folklore**.
- `kind` is a readable product label, not a universal classification of supernatural belief. Object beings, nature spirits, literary characters and imagined animals are not automatically dead people.
- `peaceLabel` describes the outcome for this individual: homecoming, freedom, gratitude, a cared-for place or another concrete resolution. The default game action must not be described as a real religious rite.
- `regionId` is a navigation grouping. `culture` preserves more specific attribution. A discovery region does not imply exclusive ownership of a tradition. See [the twenty-region review](region-roster-review.md).
- All story prose is newly composed. No artwork, modern film costume, performance, or illustration is licensed by a source link. Character art must remain independently made.

## Fixed production mapping

The original ten art atlases each have four records. Discovery now uses twenty cultural regions; `atlasId` and `originCountry` preserve the original art and attribution independently of `regionId`. `atlasRow` is zero-based and stays in the following order. The three sprite columns are idle, scare, and peace; battle animation uses the same character and runtime motion. Never reorder these records independently of the atlas.

| Region | Rows 0 / 1 / 2 / 3 | Cultural distinction |
| --- | --- | --- |
| CN | Jiangshi / Nie Xiaoqian / Yingning / Painted-Skin Ghost | Three literary figures use Pu Songling, not modern screen retellings. Jiangshi is a revenant type. |
| JP | Kappa / Bake-danuki / Chochin-obake / Kasa-obake | Animal and object yokai are not presumed to be human ghosts. |
| KR | Dokkaebi / Gumiho / Bulgasari / Gaekgwi | Dokkaebi, the iron-eating creature, the fox and the wayfarer ghost remain distinct categories. |
| TH | Krahang / Phi Kong Koi / Nang Tani / Krasue | Nang Tani remains in her grove. Krasue art softens the bodily-horror appearance without rewriting the source description. |
| PH | Tikbalang / Kapre / Duwende / Santelmo | Santelmo includes a local-story attribution and an explicit distinction from natural electrical light. |
| IE | Púca / Banshee / Dullahan / Merrow | Banshee is a messenger of death, not its cause. Merrow retains free choice over returning to the sea. |
| GB | Brownie / Kelpie / Selkie / Boggart | Brownie and Kelpie are labeled Scottish; Selkie notes island traditions; Boggart is northern English. |
| US | Headless Horseman / Jersey Devil / Jackalope / Hidebehind | Literary and lumber-camp figures are not relabeled as ancient Indigenous traditions or verified wildlife. |
| MX | La Planchada / La Pascualita / La Mulata de Córdoba / El Charro Negro | The mannequin story is a legend, not an anatomical claim. The Cordoba protagonist is not presumed to be a ghost. |
| BR | Saci / Curupira / Boitatá / Cuca | Indigenous roots are retained for forest beings; one-legged movement is not a joke; no copied television Cuca. |

## Source register and adaptation boundaries

These links establish provenance for the brief folklore account. Research collections and field records contain multiple versions; they do not imply that every community or contemporary practitioner endorses this game adaptation. Historical documents may include obsolete stereotypes. Such framing is excluded from the game prose.

### China

- **Jiangshi** (`jiangshi`, row 0): The homecoming and individual personality are original. Do not equate jiangshi with all Chinese ancestors or copy cinema costumes and talismans.
  - [Douglas Gildow, Flesh Bodies, Stiff Corpses, and Gathered Gold](https://www.ocf.berkeley.edu/~dmgildow/documents/GildowDouglas05.FleshBodies.pdf)
- **Nie Xiaoqian** (`nie-xiaoqian`, row 1): Original alternate festival story, not a summary of the canonical ending. Avoid film likenesses and modern character relationships.
  - [Pu Songling, Strange Stories from a Chinese Studio; historical translation by Herbert A. Giles](https://www.gutenberg.org/files/43629/43629-h/43629-h.htm)
- **Yingning** (`yingning`, row 2): Keep her family and literary identity distinct from a generic Japanese fox. Do not frame her original tale as uncomplicated comedy.
  - [Pu Songling, Strange Stories from a Chinese Studio; historical translation by Herbert A. Giles](https://www.gutenberg.org/files/43629/43629-h/43629-h.htm)
- **Painted-Skin Ghost** (`painted-skin-ghost`, row 3): The redemption is explicitly fictional and does not erase the predatory original. No skin removal, gore or modern film character Xiaowei.
  - [Pu Songling, Strange Stories from a Chinese Studio; historical translation by Herbert A. Giles](https://www.gutenberg.org/files/43629/43629-h/43629-h.htm)

### Japan

- **Kappa** (`kappa`, row 0): Do not imply that unfamiliar rivers are safe or that every kappa story is friendly. The picnic and repair are original.
  - [International Research Center for Japanese Studies, Folktales of Strange Phenomena and Yokai](https://www.nichibun.ac.jp/YoukaiDB3/search.html)
- **Bake-danuki** (`bake-danuki`, row 1): Avoid confusing tanuki with raccoons or foxes; use a family-friendly design independent of commercial characters.
  - [International Research Center for Japanese Studies, Folktales of Strange Phenomena and Yokai](https://www.nichibun.ac.jp/YoukaiDB3/search.html)
- **Chochin-obake** (`chochin-obake`, row 2): Do not claim that every old lantern becomes this yokai after an exact number of years. Eye and tongue are playful, not gruesome.
  - [Museum of International Folk Art, Chochin-obake lantern ghost](https://collection.internationalfolkart.org/objects/88360/cochin-obake-lantern-ghost)
- **Kasa-obake** (`kasa-obake`, row 3): The single leg belongs to the traditional object design; never make disability the joke. Do not invent a universal origin tale.
  - [Government of Japan, Highlighting Japan: Japanese umbrellas and umbrella yokai](https://www.gov-online.go.jp/eng/publicity/book/hlj/html/202306/202306_08_en.html)

### Korea

- **Dokkaebi** (`dokkaebi`, row 0): Do not equate dokkaebi with Japanese oni or dead humans. Use a distinct Korean-informed silhouette, not a television character.
  - [National Folk Museum of Korea, Encyclopedia of Korean Folk Culture: Goblin](https://folkency.nfm.go.kr/en/topic/detail/1968)
- **Gumiho** (`gumiho`, row 1): Original gentle individual, not a claim that all traditional gumiho are benevolent. Keep Korean identity distinct from kitsune and Chinese fox figures.
  - [Ministry of Culture, Sports and Tourism, Korea: Gumiho](https://www.mcst.go.kr/english/policy/kocis/newsView.jsp?pSeq=102)
- **Bulgasari** (`bulgasari`, row 2): Use folklore, not the 1985 film design. The recycling personality and wooden-chime repair are original; never encourage children to eat metal.
  - [Academy of Korean Studies, Encyclopedia of Korean Culture: Bulgasari](https://encykorea.aks.ac.kr/Article/E0024904)
- **Gaekgwi** (`gaekgwi`, row 3): The spirit category is sourced; this individual and reunion are fictional. Do not present the candy animation as a real memorial rite.
  - [National Folk Museum of Korea, Encyclopedia of Korean Folk Culture: Jerye, p. 217](https://folkency.nfm.go.kr/api/file/download/dictionary/123)

### Thailand

- **Krahang** (`krahang`, row 0): Original sympathetic personality. Rice-sieve imagery is retained; no graphic possession scene or claims about real people.
  - [Phya Anuman Rajathon, The Phi, Journal of the Siam Society 41.2 (1954)](https://thesiamsociety.org/wp-content/uploads/1954/03/JSS_041_2c_PhyaAnumanRajathon_ThePhi.pdf)
- **Phi Kong Koi** (`phi-kong-koi`, row 1): No blood-drinking imagery; single-leg movement is not a joke. Exclude historical ethnic comparisons and stigmatizing descriptions from source material.
  - [Phya Anuman Rajathon, The Phi, Journal of the Siam Society 41.2 (1954)](https://thesiamsociety.org/wp-content/uploads/1954/03/JSS_041_2c_PhyaAnumanRajathon_ThePhi.pdf)
- **Nang Tani** (`nang-tani`, row 2): Living tree-spirit belief: never depict exorcism, eviction, disappearance or cutting the tree as success. The cleanup episode is original.
  - [Phya Anuman Rajadhon, Some Siamese Superstitions About Trees and Plants (1961), pp. 62-63](https://thesiamsociety.org/wp-content/uploads/1961/03/JSS_049_1e_PhyaAnumanRajadhon_SiameseSuperstitionsAboutTreesAndPlants.pdf)
- **Krasue** (`krasue`, row 3): Artwork intentionally obscures viscera. Do not call the traditional krasue a harmless lantern spirit or connect the figure to accusations about actual people.
  - [Phya Anuman Rajathon, The Phi, Journal of the Siam Society 41.2 (1954)](https://thesiamsociety.org/wp-content/uploads/1954/03/JSS_041_2c_PhyaAnumanRajathon_ThePhi.pdf)

### Philippines

- **Tikbalang** (`tikbalang`, row 0): Retain horse-headed form. The change of behavior is an original story, not a claim about every community's tikbalang tradition.
  - [Cultural Center of the Philippines, Sinag 2023: Mythical Folk Creatures](https://culturalcenter.gov.ph/press-release/sinag-2023-son-et-lumiere-mythical-folk-creatures-cap-ccp-anniversary-highlights/)
- **Kapre** (`kapre`, row 1): No tobacco promotion, racialized fear or imitation of modern commercial depictions. Tree gathering is original.
  - [Cultural Center of the Philippines, Sinag 2023: Mythical Folk Creatures](https://culturalcenter.gov.ph/press-release/sinag-2023-son-et-lumiere-mythical-folk-creatures-cap-ccp-anniversary-highlights/)
- **Duwende** (`duwende`, row 2): Field accounts represent particular informants, not all Filipinos. Avoid disease causation claims, extermination framing and mockery of living beliefs.
  - [University of Southern California, Digital Folklore Archives: Duwende field accounts](https://folklore.usc.edu/tag/duwende/)
- **Santelmo** (`santelmo`, row 3): Keep natural phenomenon and belief distinct. Local study supports an Eastern Samar example, not a universal Philippine interpretation.
  - [Orsal, Duran and Ocenar, Wandering Flame: A Narrative Study of Santelmo in Arteche Eastern Samar (2026)](https://rsisinternational.org/journals/ijriss/view/wandering-flame-a-narrative-study-of-santelmo-in-arteche-eastern-samar/)
  - [Diksiyonaryo.ph: Santelmo](https://diksiyonaryo.ph/search/santelmo)

### Ireland

- **Púca** (`puca`, row 0): Pronunciation and specific forms vary. The chosen festival individual is original; do not treat Samhain and modern Halloween as identical events.
  - [Fingal County Council: Puca](https://www.fingal.ie/puca)
  - [Government of Ireland, Spirits of Samhain](https://api.ireland.ie/en/halloween/spirits-of-samhain/)
- **Banshee** (`banshee`, row 1): Do not turn a death messenger into a murderer, or promise grief is cured by candy. The listening scene is an original story.
  - [Government of Ireland, Spirits of Samhain](https://api.ireland.ie/en/halloween/spirits-of-samhain/)
  - [Tourism Ireland, The Irish Creatures and Legends that Inhabit Halloween](https://www.tourismireland.com/international/en-us/news-releases/article/the-irish-creatures-and-legends-that-inhabit-halloween2)
- **Dullahan** (`dullahan`, row 2): Keep non-graphic headless silhouette; omit violent traditional implements. Original peaceful episode does not redefine the traditional death association.
  - [Tourism Ireland, The Irish Creatures and Legends that Inhabit Halloween](https://www.tourismireland.com/international/en-us/news-releases/article/the-irish-creatures-and-legends-that-inhabit-halloween2)
- **Merrow** (`merrow`, row 3): Use the cap tradition cited in the source; no forced marriage, stolen clothing romance, or assumption that sea beings are drowned humans.
  - [National Parks and Wildlife Service Ireland, Myths and Folklore, Merrow, p. 4](https://www.nationalparks.ie/app/uploads/2022/08/NPW01_House-Book_FINAL-TO-PRINT_090306.pdf)

### United Kingdom

- **Brownie** (`brownie`, row 0): Traditional gift taboos vary. The candy gift is a game mechanic, not a culturally authoritative brownie ritual.
  - [Historic Environment Scotland, Supernatural Creatures in Scottish Folklore](https://blog.historicenvironment.scot/2018/10/supernatural-creatures-scottish-folklore/)
- **Kelpie** (`kelpie`, row 1): Traditional warning remains explicit. Never depict entering unfamiliar water, riding the creature or ignoring water safety as a rewarded action.
  - [VisitScotland, Scottish Myths and Legends](https://www.visitscotland.com/things-to-do/culture-history/myths-legends)
- **Selkie** (`selkie`, row 2): Do not romanticize stealing skins or forced marriage. Keep island specificity; selkies are not simply drowned human ghosts.
  - [VisitScotland, Scottish Myths and Legends](https://www.visitscotland.com/things-to-do/culture-history/myths-legends)
- **Boggart** (`boggart`, row 3): No Harry Potter fear-transformation rule or visual references. The cupboard individual is original, not a universal boggart definition.
  - [Visit Manchester, Greater Manchester Boggart Traditions](https://www.visitmanchester.com/ideas-and-inspiration/blog/post/magical-stories-mysterious-landscapes-and-greater-manchester-s-boggart-problem-dr-oliver-bishop-tells-all/)

### United States

- **Headless Horseman** (`headless-horseman`, row 0): No gore, neck wounds or Disney likeness. Do not claim this invented resolution is Irving's ending or an established local belief.
  - [Smithsonian National Museum of American History, Illustrating Ichabod](https://www.americanhistory.si.edu/explore/stories/illustrating-ichabod)
- **Jersey Devil** (`jersey-devil`, row 1): Do not present legends about a real family or childbirth as fact, or use disability as a monstrous trait.
  - [New Jersey Pinelands Commission, Jersey Devil](https://www.nj.gov/pinelands/infor/educational/facts/jerseydevil.shtml)
- **Jackalope** (`jackalope`, row 2): Clearly identify tall-tale animal. Do not label it an ancient Indigenous belief or a real biological species.
  - [Zoo Atlanta, Are Jackalopes Real?](https://zooatlanta.org/are-jackalopes-real/)
- **Hidebehind** (`hidebehind`, row 3): Use lumber-camp provenance, not generic Native American mythology. No predation imagery; social shyness is not portrayed as something requiring a cure.
  - [PBS Monstrum, Why Lumberjacks Never Look Behind Them](https://www.pbs.org/video/why-lumberjacks-never-look-behind-them-nstnmj/)

### Mexico

- **La Planchada** (`la-planchada`, row 0): No medical advice, miracle-cure claims or identifying a real deceased nurse as the legend. The recipient and cards are original.
  - [Universidad Nacional Autonoma de Mexico, La Planchada folklore research](https://datosabiertos.unam.mx/FFyL%3ARU-UNAM%3A57372)
- **La Pascualita** (`la-pascualita`, row 1): Do not assert preserved remains or copy the actual shop mannequin likeness. Legendary movement is attributed as a story, not fact.
  - [Secretaria de Educacion Publica, Leyendas aqui y alla](https://nuevaescuelamexicana.sep.gob.mx/contenido/coleccion/leyendas-aqui-y-alla/)
- **La Mulata de Córdoba** (`la-mulata-de-cordoba`, row 2): Historical racial label is retained only as the established character title. No exoticization or suggestion that ancestry causes supernatural evil; avoid factual biographical claims.
  - [Secretaria de Educacion Publica, Multiples Lenguajes, second grade, accessible edition](https://conocetuslibros.sep.gob.mx/storage/recursos/formato_accesible/mLvCWQrQ44-primaria_2g_fa_multipleslenguajes.pdf)
- **El Charro Negro** (`el-charro-negro`, row 3): Preserve the cautionary background. Original compassionate episode does not assert redemption of a religious entity or invite occult bargains.
  - [Secretaria de Educacion Publica, Leyendas aqui y alla](https://nuevaescuelamexicana.sep.gob.mx/contenido/coleccion/leyendas-aqui-y-alla/)
  - [Instituto Municipal de Planeacion de Guanajuato, Intangible Heritage Inventory](https://www.implanguanajuato.gob.mx/wp-content/uploads/2021/10/V.-Fichas-patrimonio-intangible-001-058.pdf)

### Brazil

- **Saci** (`saci`, row 0): No tobacco or disability joke. Avoid flattening Brazil's diverse Indigenous, African and European influences into one fixed origin claim.
  - [Camara dos Deputados, Plenarinho: Personagens do Folclore Brasileiro](https://plenarinho.leg.br/index.php/2018/08/personagens-folclore-brasileiro/)
- **Curupira** (`curupira`, row 1): Indigenous roots must remain visible without claiming all communities share one account. No exorcism, disappearance, sacred costume copying or foot-based ridicule.
  - [Secretaria Municipal de Educacao de Goiania, Folclore](https://sme.goiania.go.gov.br/conexaoescola/ensino_fundamental/folclore/)
- **Boitatá** (`boitata`, row 2): The safety-oriented episode is original. No invitation to approach wildfires or claim that supernatural protection replaces fire precautions.
  - [Secretaria Municipal de Educacao de Goiania, Folclore](https://sme.goiania.go.gov.br/conexaoescola/ensino_fundamental/folclore/)
- **Cuca** (`cuca`, row 3): Independent design; no copied modern television alligator styling. Avoid endorsing fear-based parenting or treating the new ending as traditional folklore.
  - [Camara dos Deputados, Plenarinho: Personagens do Folclore Brasileiro](https://plenarinho.leg.br/index.php/2018/08/personagens-folclore-brasileiro/)

## Review status and release checks

Completed by this content task: 40 distinct records, exactly four per region, unique stable IDs, native names, nonempty source links, 40 independent wishes, and 120 original ending panels. Each folklore paragraph is 40–70 English words; each ending panel is 25–40 words.

Not yet completed: native cultural review, final image-to-content review, real-player comprehension testing, and brand approval of the finished presentation. The catalog must not be labeled culturally approved until those checks actually occur.

Before release, verify each of the following against the final rendered game:

1. The selected sprite, name, region and `atlasRow` match in every animation state and share card.
2. The original story disclosure is visible before or alongside a newly unlocked ending; the folklore account remains separately accessible.
3. Thai tree-spirit imagery remains in its grove; Krasue has no exposed viscera; headless riders have no gore; Kapre and Saci have no smoking prop.
4. Skin color, mixed ancestry, body shape, single-leg movement and belief are not the source of a visual joke or a scoring difference.
5. The game never presents charity, candy or winning a duel as an actual religious practice or as proof of supernatural claims.
6. All 40 endings can be read at the player's pace. Reduced-motion presentation keeps the same text and emotional outcome.
7. Use the record-level review notes when updating art or translations. A change to a source interpretation requires an editorial version bump, not a silent lore replacement.

## Validation performed

- Parsed `content/catalog.json` as UTF-8 JSON.
- Verified ten unique region IDs, forty unique character IDs, four rows per region and three story panels per character.
- Verified every folklore paragraph and story panel against the word-count ranges above.
- Verified every character has at least one HTTPS source, a valid runtime animation family and a hexadecimal palette color.
- Verified the data contains no embedded HTML, copied source quotations, draft filler text or placeholder stories.
