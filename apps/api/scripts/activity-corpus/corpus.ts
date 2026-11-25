/**
 * Lines for the local activity simulator (DEV-01). Nothing here is inserted
 * until that simulator is switched on. `{mention}` is a slot the simulator
 * replaces with a real `@username` that is not the author.
 */
export interface ActivityExample {
  id: string;
  kind: "post" | "reply";
  parentId: string | null;
  text: string;
  /** File under `images/`, or null when the line is text only. */
  image: string | null;
}

const posts = [
  "The south platform light lasted four minutes. I used all of them.",
  "Brown the onions longer than feels reasonable. The soup depends on it.",
  "Fog sat in the valley until nine. The ridge stayed clear the whole time.",
  "The quartet played the last tune with the amps off. Nobody checked a phone.",
  "We argued about the ending for an hour and nobody remembered the same page.",
  "First ripe tomatoes this week. They tasted like the weather had cooperated.",
  "Six people, one new game, and we still finished before the last train.",
  "Tailwind on the way in, headwind all the way home. Worth it anyway.",
  "New beans from the shop on Pine. Two degrees cooler and the cup opened up.",
  "Filled three pages at the station while the train sat there.",
  "The bakery on King put the cardamom buns out at 7:40. I got the last one.",
  "Rain on the river path and not a single person turned around.",
  "Left the market with more citrus than the week can use. No regrets.",
  "The little room above the bookstore had a poet I had never heard of.",
  "My sourdough finally held its shape. I am choosing to take this personally.",
  "Saw the same heron on the east bridge three mornings in a row.",
  "The night bus was quiet enough to finish a chapter I have been avoiding.",
  "Someone left a perfectly good chair on the corner. It is now my chair.",
  "Practice ran long and the lights came on before we noticed the sky.",
  "The neighbor's jasmine is doing more for this street than the new lamps.",
  "I took the long way past the old mill just to see if the wheel was turning.",
  "Coffee went cold while I rewrote one sentence. The sentence survived.",
  "The Saturday market had peaches that actually smelled like peaches.",
  "Missed the ferry by the time it takes to tie a shoe. Next one in an hour.",
  "A kid on the tram explained constellations to the whole carriage. Correctly.",
  "The library's late shelf had the novel our group keeps meaning to start.",
  "Wore the jacket I usually save for colder days. The wind agreed with me.",
  "Found the good dumplings are the ones without a line, two streets over.",
  "The harbor was flat enough to hear a conversation on the other pier.",
  "Painted the balcony railing and immediately leaned on it. Classic.",
  "Saving a seat for {mention} if this train ever decides to move.",
  "{mention} was right about the second trail. The first one is mostly stairs.",
  "I told {mention} I would bring the train game and not the one we abandoned.",
  "Does {mention} know the bookshop is open late on Thursdays now?",
  "Leaving the extra tomatoes on the step for {mention}. They will not survive the weekend here.",
  "The unamplified closer is the part I wanted {mention} to hear.",
  "Walked the long way so I could tell {mention} the bridge is open again.",
  "{mention} asked for the soup recipe. I am writing it down before I forget the onions.",
  "The light {mention} likes on the south platform showed up again this morning.",
  "Keeping the end seat for {mention}. The middle of this carriage is a lost cause.",
  "The laundromat on 4th has new chairs and the same unreliable dryer three.",
  "A trumpet practiced scales across the courtyard for twenty honest minutes.",
  "Bought flowers I cannot name because they looked sturdy enough for the table.",
  "The climb to the lookout is shorter than I remember and steeper than I admit.",
  "Finished the scarf. It is slightly wider at one end, which I am calling design.",
  "The corner grocery started slicing the bread while you wait. Dangerous.",
  "Two swimmers were already out when I reached the lake. The water looked serious.",
  "Reorganized the spice shelf and found cumin I forgot I owned.",
  "The matinee was half empty and the sound was better for it.",
  "A dog in a yellow coat supervised the entire crosswalk. Very official.",
  "I finally tried the noodle place under the tracks. The broth is the whole point.",
  "The museum cafe has better light than the galleries today.",
  "Patched the bike tire on the sidewalk and got applauded by a stranger.",
  "The storm knocked the basil over and somehow the basil looks pleased.",
  "Read on the steps until the stone got cold. That is my cue.",
  "Someone is grilling fish on a balcony and the whole block knows.",
  "The early train had one other person and we both pretended not to notice.",
  "I keep walking past the pottery studio and today I went in.",
  "The park fountain is off, which makes the square feel like a weekday.",
  "Brought back sand in my shoes and a better mood than I left with.",
  "The hardware store cut the dowel while I decided what I was building.",
  "A violin case on the bus and nobody asked. I wanted the story anyway.",
  "The soup needed acid. A lemon from the bottom of the bag saved dinner.",
  "Clouds sat on the hill so the houses looked like they were commuting.",
  "I said I would only look at records. I am now the owner of two.",
  "The classroom windows were open and a math lesson drifted into the street.",
  "Waited out the shower under the station clock. It was a short one.",
  "The new bench faces the water instead of the road. Correct decision.",
  "My seedling has two real leaves and I am more invested than I planned.",
  "The choir rehearsed with the door open. The alley was the better seat.",
  "Found a shortcut that is longer and prettier, so it counts.",
  "The espresso was bitter until I waited ten more seconds. Patience, noted.",
  "A street photographer asked before taking the picture. I said yes.",
  "The tide was so far out the pier posts had their whole lives showing.",
  "I roasted a chicken like a person who has a plan. The plan was salt.",
  "The evening class let out in a rush and then the street went quiet again.",
  "Borrowed a ladder, returned it cleaner, kept the higher lightbulb.",
  "The comic shop recommended something finished. I appreciate a complete story.",
  "Rain on hot pavement smells like the start of a better afternoon.",
  "I sketched the station clock and missed the train I was not taking.",
  "The little league game had more commentary from the stands than the field.",
  "A cargo bike with a dog in the front basket passed me like a parade.",
  "The bakery line moved because everyone already knew their order. I learned.",
  "Put the good plates on for an ordinary Tuesday. The pasta noticed.",
  "The hill behind the school turns gold for about fifteen minutes. I caught it.",
  "Someone tuned a piano upstairs for an hour. I got a free recital.",
  "The ferry coffee is bad and the view makes an argument I accept.",
  "I mended the tear instead of replacing the coat. The mend looks honest.",
  "A pop-up book stall had a dictionary I did not need and now own.",
  "The pool was lap-swim quiet. I did six and called it a victory.",
  "The sunset hit the glass building and the whole block squinted together.",
  "I asked for the soup of the day and did not ask what it was. Correct.",
  "The night market had one stall selling only citrus. I respect the focus.",
  "Walked home the river way so the day would take a little longer to end.",
  "The workshop radio played a song I had forgotten the name of and hummed anyway.",
  "A neighbor knocked to say the package was theirs. We talked for twenty minutes.",
  "The first cold morning and the radiator clanked like it had opinions.",
  "I left the window open and the room smells like rain and bread.",
  "The trail marker is missing and the path is obvious, which feels like a trick.",
  "Bought the ugly mug because it holds the right amount and does not tip.",
  "The band soundchecked for longer than they played. I would have stayed for that.",
  "A kid sold lemonade with a pricing chart. I paid the premium for extra ice.",
  "The archive reading room is the quietest warm room in the city.",
  "I overcooked the greens and rescued them with garlic. Dinner survived.",
  "The bus driver waited for the person running. Small mercies, logged.",
  "Cloud cover made the noon light soft enough to photograph the alley.",
  "The community garden gate sticks. Everyone still holds it for the next person.",
  "I finished the puzzle and immediately wanted a harder one. This is a problem.",
  "The late show let out into rain nobody had brought a coat for.",
  "A cyclist rang the bell like a greeting, not a warning. I waved.",
  "The deli sliced the cheese thicker than I asked and I am not complaining.",
  "Sat on the museum steps with a sandwich and no agenda. Highly recommended.",
  "The moon was up before the streetlights. I felt underdressed for it.",
  "I wrote the postcard and then walked it to the box so I would actually send it.",
  "The stairwell echoes if you hum. I checked. It does.",
  "A pop-up choir at the station sang one verse and vanished. Perfect length.",
  "The tomato plants are taller than the stakes. We are in negotiations.",
  "I took the earlier train and got a seat and a chapter. That is the whole trick.",
  "The corner florist wrapped the stems like they were going somewhere important.",
  "Rain stopped halfway across the bridge. I stayed on the dry side on principle.",
];

const replies: { parent: number; text: string }[] = [
  {
    parent: 0,
    text: "That south-platform light is the same ten minutes I keep missing.",
  },
  {
    parent: 1,
    text: "I always pull the onions too early. Trying the longer version tonight.",
  },
  {
    parent: 2,
    text: "Which trailhead was that? I underestimate the last mile every time.",
  },
  {
    parent: 3,
    text: "An unamplified closer is rare in that room. I would have stayed.",
  },
  {
    parent: 4,
    text: "Our group split on the ending too. I still do not trust the narrator.",
  },
  {
    parent: 5,
    text: "Mine are still green. I have been blaming the pot and the pot knows.",
  },
  {
    parent: 6,
    text: "Finishing before the last train is the real victory. Count me in.",
  },
  {
    parent: 7,
    text: "I took the headwind direction this morning and regretted the second bridge.",
  },
  {
    parent: 8,
    text: "The Pine Street beans have been harsh for me. Dropping the temperature.",
  },
  {
    parent: 9,
    text: "The sketch of that clock is the one I would actually put on a wall.",
  },
  {
    parent: 10,
    text: "Those cardamom buns are gone by the time I get there. Going earlier.",
  },
  {
    parent: 11,
    text: "The river path in the rain is a personality test. You passed.",
  },
  {
    parent: 12,
    text: "I will take one lemon off your hands if they are still looking for a home.",
  },
  {
    parent: 13,
    text: "What was the poet's name? I need a reason to go upstairs.",
  },
  {
    parent: 14,
    text: "A loaf that holds its shape is a holiday. Enjoy it while it lasts.",
  },
  {
    parent: 15,
    text: "I saw that heron yesterday and assumed I had invented it.",
  },
  {
    parent: 16,
    text: "The night bus is the only place I finish anything. Glad it was quiet.",
  },
  {
    parent: 17,
    text: "A free chair is a serious responsibility. Does it wobble?",
  },
  {
    parent: 18,
    text: "Practice under the lights always feels like a different sport.",
  },
  {
    parent: 19,
    text: "That jasmine is doing community work. I cross the street for it.",
  },
  {
    parent: 20,
    text: "The wheel was turning on Sunday. Slow, but it was turning.",
  },
  { parent: 21, text: "Cold coffee and one good sentence is a fair trade." },
  {
    parent: 22,
    text: "Those peaches were the first fruit this year that smelled like itself.",
  },
  {
    parent: 23,
    text: "The next ferry has the better light anyway. Sorry about the shoe.",
  },
  {
    parent: 24,
    text: "I hope the carriage clapped. That kid had the material.",
  },
  {
    parent: 25,
    text: "If it is the blue-covered one, start before Tuesday or we will stall.",
  },
  { parent: 26, text: "That jacket has been waiting for exactly this wind." },
  { parent: 27, text: "No line is the correct review. I am going tomorrow." },
  {
    parent: 28,
    text: "A quiet harbor is unsettling in the best way. Glad you caught it.",
  },
  {
    parent: 29,
    text: "Wet paint and immediate regret is a genre. The railing looks good though.",
  },
  {
    parent: 30,
    text: "I can be there in twelve minutes if {mention} is still holding it.",
  },
  {
    parent: 31,
    text: "The stairs are the point, unfortunately. Bring water anyway.",
  },
  {
    parent: 32,
    text: "The train game it is. I will not even look at the abandoned one.",
  },
  {
    parent: 33,
    text: "Thursdays until eight. I checked after {mention} mentioned it.",
  },
  {
    parent: 34,
    text: "I will take them. Mine never get enough sun to finish the job.",
  },
  {
    parent: 35,
    text: "I am sorry I missed the closer. Tell me if they do it again.",
  },
  {
    parent: 36,
    text: "The bridge being open changes my whole walk home. Thank you.",
  },
  {
    parent: 37,
    text: "Write the onions down first. That is the part I always lose.",
  },
  {
    parent: 38,
    text: "I will be on that platform tomorrow if the light is forecast.",
  },
  { parent: 39, text: "The end seat is a public service. I owe you one." },
  {
    parent: 40,
    text: "Dryer three owes me a shirt. The new chairs are a nice distraction.",
  },
  {
    parent: 41,
    text: "Twenty minutes of scales is more music than some concerts give you.",
  },
  {
    parent: 42,
    text: "Sturdy flowers are the correct kind. Names are optional.",
  },
  {
    parent: 43,
    text: "It got steeper. You are not misremembering. I checked with my knees.",
  },
  {
    parent: 44,
    text: "A wider end is how you know a person made it. Wear it.",
  },
  {
    parent: 45,
    text: "Waiting while they slice it is how I lose the rest of the afternoon.",
  },
  {
    parent: 46,
    text: "Serious water is still water. Six laps would impress me.",
  },
  {
    parent: 47,
    text: "Forgotten cumin is a gift from a past self who had plans.",
  },
  {
    parent: 48,
    text: "Half empty and good sound is the best way to see anything.",
  },
  {
    parent: 49,
    text: "A dog in a yellow coat outranks all of us. As it should.",
  },
  {
    parent: 50,
    text: "The broth is worth the walk under the tracks. Go hungry.",
  },
  {
    parent: 51,
    text: "The cafe light has been better than the show for a month.",
  },
  {
    parent: 52,
    text: "Sidewalk repairs deserve applause. I hope the tire holds.",
  },
  {
    parent: 53,
    text: "Basil enjoys drama. Stake it anyway or it will take the balcony.",
  },
  { parent: 54, text: "Cold stone is a reliable editor. I use the same cue." },
  {
    parent: 55,
    text: "The whole block is having fish for dinner whether we planned to or not.",
  },
  {
    parent: 56,
    text: "Early trains are a small private club. Glad you both kept the rules.",
  },
  {
    parent: 57,
    text: "Going in is the hard part. Did you touch anything or just look?",
  },
  {
    parent: 58,
    text: "A fountain that is off makes the square feel like it is thinking.",
  },
  {
    parent: 59,
    text: "Sand in the shoes is the receipt. Sounds like a good day.",
  },
  {
    parent: 60,
    text: "A receipt with a drawing on it is the best kind of manual.",
  },
  {
    parent: 61,
    text: "I wanted the story too. A violin case is an unfinished sentence.",
  },
  {
    parent: 62,
    text: "Lemon at the bottom of the bag has saved more dinners than skill.",
  },
  {
    parent: 63,
    text: "Houses in cloud commute better than I do. Lovely image.",
  },
  {
    parent: 64,
    text: "Two records is a restrained visit. I am proud of you and suspicious.",
  },
  {
    parent: 65,
    text: "An open window and a math lesson is my favorite kind of noise.",
  },
  {
    parent: 66,
    text: "Short showers under the station clock are a civic tradition.",
  },
  { parent: 67, text: "Facing the water is the whole job of a bench. Good." },
  {
    parent: 68,
    text: "Two real leaves is a relationship. Water it before you name it.",
  },
  {
    parent: 69,
    text: "The alley seat is always better. I am sorry I missed the rehearsal.",
  },
  { parent: 70, text: "A longer prettier shortcut is the only kind I trust." },
  {
    parent: 71,
    text: "Ten more seconds is the whole craft. I rush it every time.",
  },
  {
    parent: 72,
    text: "Asking first is the difference. I would have said yes too.",
  },
  {
    parent: 73,
    text: "The pier posts having a biography is my favorite kind of low tide.",
  },
  {
    parent: 74,
    text: "Salt is a plan. Most of my best dinners started that way.",
  },
  {
    parent: 75,
    text: "The street going quiet after a class lets out is its own small event.",
  },
  {
    parent: 76,
    text: "Returning a ladder cleaner is how you get to borrow it again.",
  },
  {
    parent: 77,
    text: "A finished story is a luxury. What did they put in your hands?",
  },
  {
    parent: 78,
    text: "Hot pavement and rain is the smell of the day turning around.",
  },
  {
    parent: 79,
    text: "Missing a train you were not taking is the correct use of a station.",
  },
];

function postId(index: number): string {
  return `post-${String(index + 1).padStart(3, "0")}`;
}

/** 120 posts and 80 replies. The first 30 posts name a picture; the rest do not. */
export const activityCorpus: ActivityExample[] = [
  ...posts.map((text, index) => ({
    id: postId(index),
    image:
      index < 30 ? `scene-${String(index + 1).padStart(2, "0")}.png` : null,
    kind: "post" as const,
    parentId: null,
    text,
  })),
  ...replies.map((reply, index) => ({
    id: `reply-${String(index + 1).padStart(3, "0")}`,
    image: null,
    kind: "reply" as const,
    parentId: postId(reply.parent),
    text: reply.text,
  })),
];
