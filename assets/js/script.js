/* =========================================================
   FIREBASE — Authentication
   Loaded as real ES module imports straight from Firebase's own CDN
   (no npm install / bundler needed). This only works because index.html
   loads this file as <script type="module">, which is what makes a
   top-level `import` legal here.

   ---- What to set up in the Firebase Console (console.firebase.google.com) ----
   1. Create a project (or use an existing one).
   2. Build → Authentication → "Get started".
   3. "Sign-in method" tab → enable the "Email/Password" provider.
   4. "Sign-in method" tab → enable the "Google" provider (pick a support
      email when it asks for one).
   5. Project settings (gear icon, top left) → "Your apps" → Add app → the
      Web icon (</>) → register the app (Firebase Hosting is NOT required)
      → it shows you a firebaseConfig object → copy those values into
      FIREBASE_CONFIG below.
   6. Authentication → Settings → "Authorized domains" → add every domain
      you actually deploy Lumen to (localhost is already allowed by default,
      which is enough for local testing).
   No client secret and no backend/Cloud Functions are needed for any of
   this — every value below is a public identifier, safe to ship as-is.
========================================================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
    getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged,
    createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail,
    updateProfile, signOut, GoogleAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

// ↓↓↓ Replace every value below with the ones from your own Firebase project
// (step 5 above). Leaving the placeholders in place just means sign-in will
// show a clear "Firebase isn't set up yet" error instead of working.
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAxYRU6hXqABxSVansgQGV7sQnI4VYoiPw",
    authDomain: "continue-with-8e0cc.firebaseapp.com",
    projectId: "continue-with-8e0cc",
    storageBucket: "continue-with-8e0cc.firebasestorage.app",
    messagingSenderId: "263171245328",
    appId: "1:263171245328:web:86f54266b57be3b95cd195"
};

// Deliberately defensive: if the config above is still a placeholder, or
// Firebase fails to load for any reason, the rest of Lumen (mood, activities,
// Nova, progress, languages, animations) must keep working exactly as before
// — only sign-in/sign-up itself should be affected.
let firebaseAuth = null;
let googleProvider = null;
try {
    const firebaseApp = initializeApp(FIREBASE_CONFIG);
    firebaseAuth = getAuth(firebaseApp);
    googleProvider = new GoogleAuthProvider();
    setPersistence(firebaseAuth, browserLocalPersistence).catch(() => { });
} catch (e) {
    console.error('Lumen: Firebase failed to initialize — sign-in will be unavailable until FIREBASE_CONFIG (top of script.js) is filled in with your real project values.', e);
}

(function () {
    "use strict";

    const hasWindowStorage = (typeof window !== 'undefined') && !!window.storage && typeof window.storage.get === 'function';
    // window.storage only exists inside a Claude.ai artifact preview — on a real, standalone
    // deployment of these three files (which is what separating them out was for) it's simply
    // not present. localStorage is the actual persistence layer for a real site, so it's the
    // primary path; window.storage is used opportunistically if this ever runs inside an
    // artifact preview again.
    const hasLocalStorage = (function () {
        try { const k = '__bloom_probe__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; }
        catch (e) { return false; }
    })();

    /* =========================================================
       1. GOAL METADATA
    ========================================================= */
    const GOAL_META = {
        reading: { label: 'Reading', icon: '📖', color: '#D9A441', desc: "A real passage or two, chosen for tonight." },
        fitness: { label: 'Fitness', icon: '💪', color: '#5FA9A0', desc: "Movement that fits in a pocket of time." },
        languages: { label: 'Languages', icon: '🗣️', color: '#6FA8DC', desc: "A handful of words you'll actually use." },
        design: { label: 'Graphic Design', icon: '🎨', color: '#D97A5C', desc: "A real brief, a real tool, real feedback." },
        wellness: { label: 'Mental Wellness', icon: '🧘', color: '#C48FCB', desc: "A few quiet, offline minutes." },
        coding: { label: 'Coding', icon: '💻', color: '#5AC8C8', desc: "A small, checkable challenge." },
        photography: { label: 'Photography', icon: '📷', color: '#E0B23C', desc: "Train your eye with the camera in your pocket." },
        cooking: { label: 'Cooking', icon: '🍳', color: '#E0785A', desc: "A real recipe, sized for tonight." },
        entrepreneurship: { label: 'Entrepreneurship', icon: '🚀', color: '#C98A2E', desc: "One concrete step on a real idea." },
        sports: { label: 'Sports', icon: '🏅', color: '#4E9BD6', desc: "Study it, drill it, or move." },
        museums: { label: 'Museums & Art', icon: '🏛️', color: '#B7A6E0', desc: "A little art or history, no ticket needed." },
        events: { label: 'Events', icon: '🎟️', color: '#D080B8', desc: "Find or plan something worth showing up for." },
        music: { label: 'Music', icon: '🎵', color: '#7C8FE0', desc: "Play, practice, or really listen." },
        travel: { label: 'Travel', icon: '✈️', color: '#DFC24E', desc: "Research, plan, or explore close to home." }
    };

    // Step 1 asks "who do you want to become," not "what subject do you want" — so the goals
    // screen picks from these identities, not raw GOAL_META entries. Each identity bundles the
    // real subjects behind it; profile.goals is set to the whole bundle at once, and every
    // downstream system (buildPath, style relevance, stats, the forest) already loops over
    // profile.goals generically, so nothing else needed to change for this to work.
    const IDENTITY_META = {
        learner: { label: 'Lifelong Learner', icon: '🌱', color: '#D9A441', tagline: "Read, learn a language, or take in a little art and history.", goals: ['reading', 'languages', 'museums'] },
        active: { label: 'Healthy & Active', icon: '💪', color: '#5FA9A0', tagline: "Move your body, and get sharper at the sport you love.", goals: ['fitness', 'sports'] },
        creative: { label: 'Creative Mind', icon: '🎨', color: '#D97A5C', tagline: "Design, shoot, cook, or play — make something today.", goals: ['design', 'photography', 'music', 'cooking'] },
        builder: { label: 'Builder', icon: '💻', color: '#5AC8C8', tagline: "Ship a little code, or take one real step on an idea.", goals: ['coding', 'entrepreneurship'] },
        explorer: { label: 'Explorer', icon: '🌍', color: '#DFC24E', tagline: "Plan a trip, or find something worth showing up for nearby.", goals: ['travel', 'events'] },
        calm: { label: 'Calm Mind', icon: '🧠', color: '#C48FCB', tagline: "A few quiet, offline minutes for your head.", goals: ['wellness'] }
    };

    const TIME_PRESETS = [5, 15, 30, 60];

    const STYLE_OPTIONS = [
        { id: 'reading', icon: '📖', label: 'Reading', desc: 'Text you can actually sit with.' },
        { id: 'video', icon: '🎥', label: 'Watching', desc: 'Short videos over long reads.' },
        { id: 'audio', icon: '🎧', label: 'Listening', desc: 'Podcasts and audio, hands-free.' },
        { id: 'challenge', icon: '⚡', label: 'Mini Challenges', desc: 'Quick, hands-on tasks you just do.' },
        { id: 'creative', icon: '✏️', label: 'Creative Projects', desc: 'Sketch, write, or build something small.' }
    ];

    const MOOD_META = {
        energized: { icon: '😄', label: 'Energized' },
        calm: { icon: '😌', label: 'Calm' },
        tired: { icon: '😴', label: 'Tired' },
        stressed: { icon: '😣', label: 'Stressed' },
        creative: { icon: '🎨', label: 'Creative' }
    };

    // Each mood's "sound" is synthesized live with the Web Audio API rather than shipped as
    // audio files — dependency-free, nothing to fetch or license. Two shapes: a 'pad' is a
    // slow, sustained chord (calm/tired/stressed — a meditative drone, gently breathing via a
    // soft LFO); an 'arp' is a loop of single plucked notes (energized/creative — actual
    // melodic movement instead of a held chord, so it reads as music, not a drone or a wobble).
    const MOOD_AUDIO_RECIPE = {
        energized: { mode: 'arp', notes: [440.00, 523.25, 659.25, 880.00, 659.25, 523.25], tempo: 0.24, type: 'triangle', filterHz: 2600, gain: 0.07 },
        calm: { mode: 'pad', freqs: [196.00, 246.94, 293.66], type: 'sine', filterHz: 650, lfoHz: 0.05, lfoDepth: 40, gain: 0.045, bellFreq: 783.99, bellEvery: 9 },
        tired: { mode: 'pad', freqs: [130.81, 195.99], type: 'sine', filterHz: 380, lfoHz: 0.035, lfoDepth: 25, gain: 0.04 },
        stressed: { mode: 'pad', freqs: [146.83, 220.00, 293.66], type: 'sine', filterHz: 480, lfoHz: 0.045, lfoDepth: 30, gain: 0.038, bellFreq: 587.33, bellEvery: 12 },
        creative: { mode: 'arp', notes: [523.25, 587.33, 698.46, 783.99, 880.00, 698.46], tempo: 0.3, type: 'sine', filterHz: 3200, gain: 0.06 }
    };

    // Light-mode counterpart to MOOD_AUDIO_RECIPE — same mood, same shape (pad/arp), but a
    // genuinely different arrangement, not the dark version transposed up an octave or sped up.
    // Each one uses a different chord/scale, voicing, and (for the arps) note contour and count,
    // so the loop itself sounds like a different piece of music, not the night version playing
    // faster. Swapped in by startMoodAmbience() based on the current light/dark theme, and
    // crossfaded whenever the theme toggles mid-ambience.
    const MOOD_AUDIO_RECIPE_LIGHT = {
        // Dark is an A-minor-ish 6-note run; light is a brighter C-major 7-note walk up-and-back
        // on a square wave instead of triangle — a different key, contour, and timbre, not just tempo.
        energized: { mode: 'arp', notes: [523.25, 659.25, 783.99, 1046.50, 987.77, 783.99, 659.25], tempo: 0.16, type: 'square', filterHz: 4200, gain: 0.045 },
        // Dark is a close G-major triad (G3 B3 D4); light is an open, spread D-major voicing
        // (D4 F#4 A4 D5) — a different chord entirely, not the same one shifted up an octave.
        calm: { mode: 'pad', freqs: [293.66, 369.99, 440.00, 587.33], type: 'sine', filterHz: 1500, lfoHz: 0.06, lfoDepth: 55, gain: 0.036, bellFreq: 880.00, bellEvery: 7 },
        // Dark is a bare, sparse open fifth (C3 G3); light is a fuller, cozy Cmaj7 voicing —
        // still soft and unhurried, but a genuinely different chord quality.
        tired: { mode: 'pad', freqs: [261.63, 329.63, 392.00, 493.88], type: 'sine', filterHz: 1100, lfoHz: 0.04, lfoDepth: 28, gain: 0.032 },
        // Dark is a tense bare D open-fifth-plus-octave; light is an open, suspended E voicing
        // (Esus4-ish) — less "stuck," a different harmonic color rather than the same tension up high.
        stressed: { mode: 'pad', freqs: [329.63, 440.00, 493.88, 659.25], type: 'sine', filterHz: 1300, lfoHz: 0.05, lfoDepth: 38, gain: 0.03, bellFreq: 987.77, bellEvery: 10 },
        // Dark climbs a C-major-ish 6-note run; light is a different, skippier 6-note contour
        // built around D/A/B instead — a different melody, not the same one restated.
        creative: { mode: 'arp', notes: [587.33, 659.25, 880.00, 987.77, 783.99, 659.25], tempo: 0.22, type: 'triangle', filterHz: 4200, gain: 0.05 }
    };

    // Keyed the same way as LANGUAGE_SETS' `language` field (an unchanged lookup key,
    // never localized) — just the flag shown on the language-picker card.
    const LANGUAGE_META = {
        Spanish: { icon: '🇪🇸' },
        Japanese: { icon: '🇯🇵' },
        French: { icon: '🇫🇷' },
        German: { icon: '🇩🇪' }
    };

    // Short line shown inside the reading overlay only — explains WHY this specific
    // passage was picked for the mood just chosen, instead of a silent random pick.
    // Looked up via t('overlay.moodNote.' + mood) at render time — this list just enumerates
    // which moods have a note at all.
    const MOOD_READING_NOTE_MOODS = ['energized', 'calm', 'tired', 'stressed', 'creative'];

    /* =========================================================
       1b. TRANSLATIONS — the app interface only. The real content
       library (passages, recipes, coding challenges, video titles,
       external links) stays English regardless of language — that's
       a genuinely separate, much larger body of hand-written text.
    ========================================================= */
    const LANGUAGES = {
        en: { label: 'English', dir: 'ltr' },
        ar: { label: 'العربية', dir: 'rtl' },
        es: { label: 'Español', dir: 'ltr' },
        fr: { label: 'Français', dir: 'ltr' }
    };

    const TRANSLATIONS = {
        en: {
            'nav.home': 'Home', 'nav.buildPath': 'Build Your Path', 'nav.myGrowth': 'My Growth',
            'nav.account': 'Your account', 'nav.brandHome': 'Lumen home', 'nav.back': 'Back',
            'welcome.headingHtml': 'Grow with <em>intention</em>.',
            'welcome.sub': "Lumen helps you build better habits, discover what matters, and become your best self — one step at a time.",
            'welcome.start': 'Start building',
            'welcome.feature1.title': 'Personalized for you', 'welcome.feature1.desc': 'Content and paths based on your goals and mood.',
            'welcome.feature2.title': 'Build better habits', 'welcome.feature2.desc': 'Small, consistent steps that create real change.',
            'welcome.feature3.title': 'Track your growth', 'welcome.feature3.desc': 'Watch your streaks, badges, and forest grow.',
            'welcome.feature4.title': 'Feel your best', 'welcome.feature4.desc': 'Mind, body, and goals — in balance.',
            'step.prefix': 'step',
            'goals.heading': 'Who do you want to become?', 'goals.sub': "Pick one focus — you can always switch to something else next time.", 'goals.continue': 'Continue',
            'identity.learner.label': 'Lifelong Learner', 'identity.learner.tagline': 'Read, learn a language, or take in a little art and history.',
            'identity.active.label': 'Healthy & Active', 'identity.active.tagline': 'Move your body, and get sharper at the sport you love.',
            'identity.creative.label': 'Creative Mind', 'identity.creative.tagline': 'Design, shoot, cook, or play — make something today.',
            'identity.builder.label': 'Builder', 'identity.builder.tagline': 'Ship a little code, or take one real step on an idea.',
            'identity.explorer.label': 'Explorer', 'identity.explorer.tagline': 'Plan a trip, or find something worth showing up for nearby.',
            'identity.calm.label': 'Calm Mind', 'identity.calm.tagline': 'A few quiet, offline minutes for your head.',
            'goal.reading.label': 'Reading', 'goal.fitness.label': 'Fitness', 'goal.languages.label': 'Languages',
            'goal.design.label': 'Graphic Design', 'goal.wellness.label': 'Mental Wellness', 'goal.coding.label': 'Coding',
            'goal.photography.label': 'Photography', 'goal.cooking.label': 'Cooking', 'goal.entrepreneurship.label': 'Entrepreneurship',
            'goal.sports.label': 'Sports', 'goal.museums.label': 'Museums & Art', 'goal.events.label': 'Events',
            'goal.music.label': 'Music', 'goal.travel.label': 'Travel',
            'goal.reading.desc': 'A real passage or two, chosen for tonight.', 'goal.fitness.desc': 'Movement that fits in a pocket of time.',
            'goal.languages.desc': "A handful of words you'll actually use.", 'goal.design.desc': 'A real brief, a real tool, real feedback.',
            'goal.wellness.desc': 'A few quiet, offline minutes.', 'goal.coding.desc': 'A small, checkable challenge.',
            'goal.photography.desc': 'Train your eye with the camera in your pocket.', 'goal.cooking.desc': 'A real recipe, sized for tonight.',
            'goal.entrepreneurship.desc': 'One concrete step on a real idea.', 'goal.sports.desc': 'Study it, drill it, or move.',
            'goal.museums.desc': 'A little art or history, no ticket needed.', 'goal.events.desc': 'Find or plan something worth showing up for.',
            'goal.music.desc': 'Play, practice, or really listen.', 'goal.travel.desc': 'Research, plan, or explore close to home.',
            'subject.subDynamic': 'Everything here fits your %identity% focus — pick what feels right today.',
            'time.heading': 'How much time do you actually have?', 'time.sub': 'Drag to set your own, or tap a preset. This decides how many stops are on your path.',
            'time.unit': 'min', 'time.continue': 'Continue',
            'subject.heading': 'What sounds good today?', 'subject.sub': "Pick what feels right — you can always switch next time.", 'subject.continue': 'Continue',
            'langStep.heading': 'Which language do you want to learn?', 'langStep.sub': "This decides the words, audio, and video in today's language practice.", 'langStep.continue': 'Continue',
            'style.heading': 'How do you like to take things in?', 'style.sub': "We'll lean toward this format whenever a goal supports it.", 'style.continue': 'Continue',
            // Goal-specific style-card labels — replace the generic Reading/Watching/etc.
            // labels on the style screen with wording native to whichever goal is picked, so
            // "how do you like to take things in" never feels like a generic media-format menu.
            'goalStyle.reading.reading': 'Read a real passage', 'goalStyle.reading.video': 'Watch a book, visualized', 'goalStyle.reading.audio': 'Listen to a book',
            'goalStyle.languages.reading': 'Learn 5 real words', 'goalStyle.languages.audio': 'Listen & pronounce', 'goalStyle.languages.video': 'Watch a lesson',
            'goalStyle.design.creative': 'Design something real', 'goalStyle.design.challenge': 'Study real work', 'goalStyle.design.reading': 'Read design thinking', 'goalStyle.design.video': 'Watch a design tutorial', 'goalStyle.design.audio': "Hear a designer's process",
            'goalStyle.coding.challenge': 'Solve a real challenge', 'goalStyle.coding.video': 'Watch a quick lesson', 'goalStyle.coding.reading': 'Read how code really breaks', 'goalStyle.coding.audio': "Hear a legendary coder's mind",
            'goalStyle.fitness.challenge': "Do today's workout", 'goalStyle.fitness.video': 'Follow a workout video',
            'goalStyle.wellness.challenge': 'Do a calming exercise', 'goalStyle.wellness.audio': 'Guided breathing', 'goalStyle.wellness.reading': 'Read something grounding', 'goalStyle.wellness.video': 'Follow a guided practice',
            'goalStyle.photography.creative': 'Shoot a photo prompt', 'goalStyle.photography.video': 'Watch a composition lesson', 'goalStyle.photography.challenge': 'Study real photos', 'goalStyle.photography.reading': "Read a photographer's insight", 'goalStyle.photography.audio': "Hear a photographer's story",
            'goalStyle.cooking.creative': 'Cook a real recipe', 'goalStyle.cooking.video': 'Watch a knife-skills lesson', 'goalStyle.cooking.challenge': 'Prep for tomorrow', 'goalStyle.cooking.reading': 'Read a real kitchen tip', 'goalStyle.cooking.audio': "Hear a chef's story",
            'goalStyle.entrepreneurship.challenge': 'Take one real step', 'goalStyle.entrepreneurship.audio': "Hear a founder's story", 'goalStyle.entrepreneurship.creative': 'Sketch your business model', 'goalStyle.entrepreneurship.reading': "Read a founder's insight", 'goalStyle.entrepreneurship.video': 'Watch how to validate an idea',
            'goalStyle.sports.challenge': 'Run a real drill', 'goalStyle.sports.video': 'Study real game film', 'goalStyle.sports.reading': 'Read how to study the game', 'goalStyle.sports.audio': "Hear a coach's mindset",
            'goalStyle.museums.reading': 'Read a real art story', 'goalStyle.museums.video': 'Take a virtual tour', 'goalStyle.museums.audio': 'Hear an art historian',
            'goalStyle.events.challenge': 'Plan something real', 'goalStyle.events.reading': 'Read what makes gatherings work', 'goalStyle.events.video': 'Watch real hosting tips', 'goalStyle.events.audio': 'Hear the psychology of gathering',
            'goalStyle.music.challenge': 'Practice active listening', 'goalStyle.music.video': 'Watch a real lesson', 'goalStyle.music.reading': 'Read how to really listen', 'goalStyle.music.audio': 'Hear a live performance',
            'goalStyle.travel.reading': 'Read a travel reflection', 'goalStyle.travel.challenge': 'Plan your trip budget', 'goalStyle.travel.creative': 'Sketch an itinerary', 'goalStyle.travel.video': 'Watch a real travel tip', 'goalStyle.travel.audio': "Hear a traveler's story",
            'mood.heading': 'How are you feeling right now?', 'mood.sub': 'This changes how ambitious today\'s path is — never the goal itself.', 'mood.buildPath': 'Build my path',
            'moodOpt.energized.label': 'Energized', 'moodOpt.calm.label': 'Calm', 'moodOpt.tired.label': 'Tired',
            'moodOpt.stressed.label': 'Stressed', 'moodOpt.creative.label': 'Creative',
            'path.heading': "Today's path", 'path.finish': "Finish today's journey", 'path.pickNewFocus': 'Pick a new focus',
            'path.skippingNote': 'By the way — you\'ve been skipping <b>%goal%</b> a lot lately. Want to switch your focus to something else?',
            'path.open': 'Open', 'path.review': 'Review', 'path.swapTooltip': 'Swap for a different %goal% activity',
            'path.stopCount': '%n% stop%s%',
            'path.notesHeading': 'Anything else you did today?', 'path.notesPlaceholder': "Write down what you actually did today — outside today's suggestions too.",
            'path.novaMessage': "since you're feeling %mood%, I put together %n% thing%s% for the %time% minutes you've got.",
            'path.moodFlavor.energized': 'Use that energy — go a little further than usual.',
            'path.moodFlavor.calm': 'Take your time and enjoy the process.',
            'path.moodFlavor.tired': 'Keep it light — small progress still counts.',
            'path.moodFlavor.stressed': "You don't need to do everything today. One calm step is enough.",
            'path.moodFlavor.creative': "Follow the idea that feels a little unusual. Don't judge it yet.",
            'completion.headingDefault': "You completed today's journey.", 'completion.headingNamed': "You completed today's journey, %name%.",
            'completion.subItalic': 'Leave better than you arrived.', 'completion.viewGrowth': 'View my growth',
            'completion.moreContent': 'More content', 'completion.moreContentTitle': 'Lumen is finite by design',
            'completion.finiteNote': "Lumen doesn't do infinite scroll. Come back tomorrow for a new path.",
            'completion.statDone': 'Done today', 'completion.statDaysActive': 'Days active', 'completion.statAllTime': 'All-time',
            'growth.eyebrow': 'your growth', 'growth.heading': "The forest you're growing", 'growth.last28': 'Last 28 days',
            'growth.dayActivitiesSingular': '%n% activity · %time% min', 'growth.dayActivitiesPlural': '%n% activities · %time% min', 'growth.dayEmpty': 'No activity recorded for this day.',
            'growth.yourNoteHeading': 'Your note',
            'growth.focusMonth': 'Focus this month', 'growth.yourForest': 'Your forest', 'growth.badgesEarned': 'Badges earned',
            'growth.buildAnother': 'Build another day', 'growth.backHome': 'Back to home', 'growth.eraseAll': 'Erase everything & start over',
            'growth.statCompleted': 'Completed', 'growth.statDaysActive': 'Days active', 'growth.statDayStreak': 'Day streak',
            'growth.eraseConfirm': 'This clears all your goals, history, badges, and forest. Start completely over?',
            'growth.emptyDashboard': 'Complete a few activities to see your dashboard grow.',
            'growth.emptyForest': 'Your forest will grow here as you complete activities.',
            'growth.emptyNovaNamed': "%name%, you haven't completed anything yet — build your first path to start growing.",
            'growth.emptyNova': "You haven't completed anything yet — build your first path to start growing.",
            'growth.topGoalSummary': 'Your %goal% is growing the fastest — Level %level% %tier% already. You\'ve shown up %days% day%ds% and completed %count% thing%cs% total. Keep going.',
            'growth.levelLabel': 'Level %n% %tier%',
            'profile.growthStoryFirst': "Your growth story starts with today's first path.",
            'profile.growthWithGoal': '%icon% Level %n% %tier% in %goal% · %days% day%ds% growing%streak%',
            'profile.growthNoGoal': '%count% thing%cs% done · %days% day%ds% growing%streak%',
            'profile.streakBit': ' · %n%-day streak',
            'badge.firstStep': 'First Step', 'badge.tenStrong': 'Ten Strong', 'badge.fiftyDeep': 'Fifty Deep',
            'badge.weekStreak': '7-Day Streak', 'badge.wellRounded': 'Well Rounded',
            'milestone.first': 'Complete your first activity to earn your %badge% badge.',
            'milestone.countSingular': '%n% more completed activity for your %badge% badge.',
            'milestone.countPlural': '%n% more completed activities for your %badge% badge.',
            'milestone.streakSingular': '%n% more day in a row for a %badge% badge.',
            'milestone.streakPlural': '%n% more days in a row for a %badge% badge.',
            'milestone.streakToday': "You're right at a 7-day streak — keep it going today.",
            'milestone.wellRounded': 'Try a different goal next time to work toward the %badge% badge.',
            'milestone.allDone': "You've earned every badge so far — genuinely impressive.",
            'tier.explorer': 'Explorer', 'tier.builder': 'Builder', 'tier.creator': 'Creator', 'tier.master': 'Master',
            'profile.welcomeHeading': 'Welcome to Lumen', 'profile.welcomeSub': 'One short, real path a day.',
            'profile.eyebrow': 'your account', 'profile.signInHeading': 'Sign in', 'profile.signInSub': "Create a free profile so today's path and progress get saved.",
            'profile.signUpHeading': 'Create your account', 'profile.createAccountBtn': 'Create account',
            'profile.namePlaceholder': 'Your name', 'profile.emailPlaceholder': 'you@example.com', 'profile.passwordPlaceholder': 'Password',
            'profile.forgotPassword': 'Forgot password?', 'profile.signInBtn': 'Sign in', 'profile.or': 'or',
            'profile.signUpBtn': 'Sign up', 'profile.emailInUse': 'That email already has an account — switch to Sign in instead.',
            'profile.continueAsGuest': 'Continue as guest',
            'profile.showPassword': 'Show password', 'profile.hidePassword': 'Hide password',
            'profile.changePhotoTitle': 'Change photo', 'profile.changePhotoAria': 'Change profile photo', 'profile.changePhotoLink': 'Change photo',
            'profile.growthPreviewDefault': "Your growth story starts with today's path.",
            'profile.displayName': 'Display name', 'profile.namePlaceholder2': 'What should Nova call you?',
            'profile.editSection': 'Edit profile', 'profile.accountSection': 'Account',
            'nav.moodLabel': 'Mood',
            'nav.audioOn': 'Mood sound on', 'nav.audioOff': 'Mood sound off',
            'nav.themeToLight': 'Switch to light mode', 'nav.themeToDark': 'Switch to dark mode',
            'profile.pickAvatar': 'Or pick an emoji avatar', 'profile.moreAvatars': '+%n% more', 'profile.showLessAvatars': 'Show less',
            'profile.saveProfile': 'Save profile', 'profile.signOut': 'Sign out', 'profile.back': 'Back',
            'profile.yourProfileHeading': 'Your profile', 'profile.yourProfileSub': 'Your account, your photo, and a shortcut into your growth.',
            'profile.savedOnDevice': 'Saved on this device',
            'profile.passwordMismatch': "That password doesn't match this email.",
            'profile.forgotNote': "Type your email above first, then tap 'Forgot password?' again to get a reset link.",
            'profile.signOutConfirm': "Sign out of Lumen? A profile is required to use the app, so you'll need to sign in again.",
            'profile.continueWithGoogle': 'Continue with Google',
            'profile.signInError': 'Something went wrong signing you in. Please try again.',
            'profile.weakPassword': 'Choose a password with at least 6 characters.',
            'profile.invalidEmailError': "That doesn't look like a valid email address.",
            'profile.tooManyAttempts': 'Too many attempts — please wait a moment and try again.',
            'profile.popupBlocked': "Your browser blocked the sign-in popup — allow popups for this site and try again.",
            'profile.unauthorizedDomain': "This site isn't authorized for sign-in yet — add this domain in Firebase Console → Authentication → Settings → Authorized domains.",
            'profile.firebaseNotConfigured': "Sign-in isn't set up yet on this site. Please try again later.",
            'profile.resetEmailSent': 'Check your email for a link to reset your password.',
            'overlay.close': 'Close', 'overlay.markComplete': 'Mark complete', 'overlay.completed': 'Completed ✓', 'overlay.tryDifferent': 'Try a different one',
            'footer.tagline': 'Lumen — leave better than you arrived.',
            'lang.switcherLabel': 'Language',
            'content.prefixRead': 'Read: ', 'content.prefixWatch': 'Watch: ', 'content.prefixListen': 'Listen: ', 'content.prefixCook': 'Cook: ', 'content.prefixDesignBrief': 'Design brief: ', 'content.prefixCodeChallenge': 'Code challenge: ', 'content.prefixPhotoPrompt': 'Photo prompt: ',
            'content.videoPlaysHere': 'Plays right here — no need to leave Lumen.', 'content.audioStaysPage': 'Press play — this stays on the page.',
            'content.learnWords': 'Learn 5 %language% words worth knowing', 'content.listenRealSpoken': 'Real spoken %language% — good for listening practice, playable right here.',
            'content.buildPalette': 'Build a 5-color palette and name each role', 'content.studyBehance': "Study one real brand's layout choices on Behance", 'content.behanceLabel': 'Open curated design work on Behance', 'content.behanceNote': 'Look at spacing and hierarchy, not just color.',
            'content.readMdn': "Read one MDN page on something you don't fully know", 'content.mdnLabel': 'Open MDN Web Docs', 'content.mdnNote': "Search for a concept you've used but never read the docs on.", 'content.linusNote': 'Linus Torvalds on building Linux — press play.',
            'content.stepOutside': 'Step outside, phone left behind, for 10 minutes', 'content.stepOutside1': "Leave your phone somewhere you can't hear it", 'content.stepOutside2': 'Walk without a destination for 10 minutes', 'content.stepOutside3': "Notice one thing you'd normally scroll past",
            'content.studyLighting': 'Study lighting in 3 photos you admire', 'content.unsplashLabel': 'Browse Unsplash for lighting ideas', 'content.paulGrahamNote': 'Photographer Paul Graham in conversation — press play.',
            'content.prepIngredient': 'Prep one ingredient for tomorrow', 'content.prepSteps1': "Pick one thing on tomorrow's menu", 'content.prepSteps2': 'Wash, chop, or portion it now', 'content.prepSteps3': "Store it somewhere you'll actually see it tomorrow", 'content.danBarberNote': "Chef Dan Barber's TED talk on sustainable food — press play.",
            'content.sketchCanvas': 'Sketch a business model canvas', 'content.canvasLabel': 'Open a free business model canvas',
            'content.museumsTalkNote': 'A real TED talk by art historian Elizabeth Lev — press play.',
            'content.browseEvents': "Browse what's happening near you", 'content.eventListingsLabel': 'Open local event listings', 'content.priyaParkerNote': "Priya Parker's TED talk on gathering well — press play.",
            'content.learnTheory': 'Learn one music theory basic', 'content.theoryLabel': 'Open music theory basics', 'content.tinyDeskNote': 'A real Tiny Desk performance — press play and just listen.',
            'content.seeBudget': 'See where your budget could actually take you', 'content.flightsLabel': 'Open Google Flights map', 'content.sketchItinerary': 'Sketch a rough 3-day itinerary somewhere new', 'content.itineraryLabel': 'Open a free itinerary planner', 'content.natGeoNote': 'A real National Geographic travel interview — press play.',
            'content.sportsAudioNote': 'A real coach interview on the Dan Patrick Show — press play.',
            'language.Spanish': 'Spanish', 'language.Japanese': 'Japanese', 'language.French': 'French', 'language.German': 'German',
            'content.chipKiddNote': "Book designer Chip Kidd's TED talk — press play.",
            'overlay.wantMoreLikeThis': 'Want more like this?', 'overlay.wordsHeading': '%language% · %n% words', 'overlay.pronounceLabel': 'Pronounce %word%', 'overlay.pronounceTitle': 'Pronounce',
            'overlay.toolsToDoThis': 'Tools to actually do this', 'overlay.describeWhatMade': 'Describe what you made — get feedback', 'overlay.designFeedbackPlaceholder': 'e.g. I used a bold serif headline, two colors, and centered everything...', 'overlay.getFeedback': 'Get feedback',
            'overlay.paletteGenerated': "Here's a generated 5-color palette. Name what each color is for, then try it in a real layout.", 'overlay.tryItSomewhereReal': 'Try it somewhere real',
            'overlay.writeFnInstruction': 'Write <code>%fn%</code> so it passes every test below, then hit Run.', 'overlay.runTests': 'Run tests', 'overlay.stuckLearnMore': 'Stuck? Learn more',
            'overlay.servesTime': 'Serves %servings% · %time% min', 'overlay.ingredients': 'Ingredients', 'overlay.steps': 'Steps', 'overlay.goDeeper': 'Go deeper',
            'overlay.sharpenEyeFirst': 'Sharpen your eye first', 'overlay.exploreMore': 'Explore more', 'overlay.playsHereLumen': 'Plays right here, in Lumen.', 'overlay.openOnYoutube': 'Open on YouTube',
            'overlay.testsPassed': '%passed%/%total% tests passed', 'overlay.errorPrefix': 'Error:', 'overlay.expectedSuffix': '(expected %expected%)', 'overlay.moreCount': '+%n% more', 'overlay.goToStep': 'Go to %step%',
            'overlay.moodNote.energized': 'Picked for an energized mood — something with momentum.', 'overlay.moodNote.calm': 'Picked for a calm mood — nothing urgent, just sit with it.',
            'overlay.moodNote.tired': 'Picked for a tired mood — short and steady, nothing to push through.', 'overlay.moodNote.stressed': 'Picked for a stressed mood — small and grounding, not one more thing to manage.',
            'overlay.moodNote.creative': 'Picked for a creative mood — something to spark an idea.',
            'preview.langExample': 'e.g. "%word%" — %translation%', 'preview.livePalette': 'A live 5-color palette, generated for you', 'preview.writeChecked': 'Write %fn%() — checked instantly against real tests',
            'preview.playsHereOnPage': 'Plays right here, on this page', 'preview.ingredientsSteps': '%ing% ingredients · %steps% steps',
            'feedback.hierarchy': 'Visual hierarchy', 'feedback.contrast': 'Contrast (color or size)', 'feedback.spacing': 'Whitespace / breathing room', 'feedback.alignment': 'Alignment / grid', 'feedback.restraint': 'Color & font restraint (2–3 max)',
            'feedback.scoreLine': '<b>%n%/5</b> core principles show up in your description.', 'feedback.worthChecking': 'Worth checking before you call it done:',
            'feedback.allCovered': "You've covered the core checklist — now step away for 10 minutes and look at it again with fresh eyes. That's usually where the real problems show up."
        },
        ar: {
            'nav.home': 'الرئيسية', 'nav.buildPath': 'ابنِ مسارك', 'nav.myGrowth': 'نموّي',
            'nav.account': 'حسابك', 'nav.brandHome': 'الصفحة الرئيسية للومن', 'nav.back': 'رجوع',
            'welcome.headingHtml': 'انمُ <em>بقصد</em>.',
            'welcome.sub': 'لومن يساعدك على بناء عادات أفضل، واكتشاف ما يهمّك، والوصول لأفضل نسخة منك — خطوة في كل مرة.',
            'welcome.start': 'ابدأ البناء',
            'welcome.feature1.title': 'مخصّص لك', 'welcome.feature1.desc': 'محتوى ومسارات مبنية على أهدافك ومزاجك.',
            'welcome.feature2.title': 'ابنِ عادات أفضل', 'welcome.feature2.desc': 'خطوات صغيرة ومستمرة تصنع تغييرًا حقيقيًا.',
            'welcome.feature3.title': 'تابع نموّك', 'welcome.feature3.desc': 'شاهد سلاسلك اليومية وأوسمتك وغابتك تنمو.',
            'welcome.feature4.title': 'اشعر بأفضل حال', 'welcome.feature4.desc': 'العقل والجسد والأهداف — في توازن.',
            'step.prefix': 'الخطوة',
            'goals.heading': 'من تريد أن تصبح؟', 'goals.sub': 'اختر تركيزًا واحدًا — يمكنك دائمًا تغييره في المرة القادمة.', 'goals.continue': 'متابعة',
            'identity.learner.label': 'متعلّم مدى الحياة', 'identity.learner.tagline': 'اقرأ، أو تعلّم لغة، أو اطّلع على قليل من الفن والتاريخ.',
            'identity.active.label': 'صحي ونشيط', 'identity.active.tagline': 'حرّك جسدك، وطوّر مهارتك في رياضتك المفضّلة.',
            'identity.creative.label': 'عقل مبدع', 'identity.creative.tagline': 'صمّم، أو صوّر، أو اطبخ، أو اعزف — اصنع شيئًا اليوم.',
            'identity.builder.label': 'باني', 'identity.builder.tagline': 'اكتب قليلًا من الكود، أو اتخذ خطوة حقيقية نحو فكرتك.',
            'identity.explorer.label': 'مستكشف', 'identity.explorer.tagline': 'خطّط لرحلة، أو ابحث عن شيء قريب يستحق الحضور.',
            'identity.calm.label': 'عقل هادئ', 'identity.calm.tagline': 'بضع دقائق هادئة بلا شاشات لعقلك.',
            'goal.reading.label': 'القراءة', 'goal.fitness.label': 'اللياقة', 'goal.languages.label': 'اللغات',
            'goal.design.label': 'التصميم الجرافيكي', 'goal.wellness.label': 'الصحة النفسية', 'goal.coding.label': 'البرمجة',
            'goal.photography.label': 'التصوير', 'goal.cooking.label': 'الطبخ', 'goal.entrepreneurship.label': 'ريادة الأعمال',
            'goal.sports.label': 'الرياضة', 'goal.museums.label': 'المتاحف والفن', 'goal.events.label': 'الفعاليات',
            'goal.music.label': 'الموسيقى', 'goal.travel.label': 'السفر',
            'goal.reading.desc': 'مقطع حقيقي أو اثنان، مختاران لهذه الليلة.', 'goal.fitness.desc': 'حركة تناسب أي وقت متاح لديك.',
            'goal.languages.desc': 'حفنة من الكلمات التي ستستخدمها فعلًا.', 'goal.design.desc': 'تكليف حقيقي، وأداة حقيقية، وملاحظات حقيقية.',
            'goal.wellness.desc': 'بضع دقائق هادئة بعيدًا عن الشاشة.', 'goal.coding.desc': 'تحدٍ صغير يمكن التحقق منه.',
            'goal.photography.desc': 'درّب عينك بالكاميرا التي في جيبك.', 'goal.cooking.desc': 'وصفة حقيقية بحجم يناسب الليلة.',
            'goal.entrepreneurship.desc': 'خطوة ملموسة واحدة على فكرة حقيقية.', 'goal.sports.desc': 'ادرسها، أو تدرّب عليها، أو تحرّك.',
            'goal.museums.desc': 'قليل من الفن أو التاريخ، بلا تذكرة.', 'goal.events.desc': 'ابحث عن شيء يستحق الحضور أو خطّط له.',
            'goal.music.desc': 'اعزف، أو تدرّب، أو استمع فعلًا.', 'goal.travel.desc': 'ابحث، أو خطّط، أو استكشف بالقرب من بيتك.',
            'subject.subDynamic': 'كل ما هنا يناسب تركيز %identity% — اختر ما يناسب شعورك اليوم.',
            'time.heading': 'كم من الوقت لديك فعليًا؟', 'time.sub': 'اسحب لتحديد وقتك الخاص، أو اختر مدة جاهزة. هذا يحدد عدد المحطات في مسارك.',
            'time.unit': 'د', 'time.continue': 'متابعة',
            'subject.heading': 'ما الذي يبدو مناسبًا اليوم؟', 'subject.sub': 'اختر ما يناسب شعورك — يمكنك دائمًا التغيير لاحقًا.', 'subject.continue': 'متابعة',
            'langStep.heading': 'ما اللغة التي تريد تعلّمها؟', 'langStep.sub': 'هذا يحدد الكلمات والصوت والفيديو في تمرين اللغة اليوم.', 'langStep.continue': 'متابعة',
            'style.heading': 'كيف تفضّل تلقّي المحتوى؟', 'style.sub': 'سنميل إلى هذا الأسلوب كلما ناسب الهدف.', 'style.continue': 'متابعة',
            'goalStyle.reading.reading': 'اقرأ مقطعًا حقيقيًا', 'goalStyle.reading.video': 'شاهد كتابًا، بصريًا', 'goalStyle.reading.audio': 'استمع لكتاب',
            'goalStyle.languages.reading': 'تعلّم ٥ كلمات حقيقية', 'goalStyle.languages.audio': 'استمع وانطق', 'goalStyle.languages.video': 'شاهد درسًا',
            'goalStyle.design.creative': 'صمّم شيئًا حقيقيًا', 'goalStyle.design.challenge': 'ادرس أعمالًا حقيقية', 'goalStyle.design.reading': 'اقرأ عن التفكير التصميمي', 'goalStyle.design.video': 'شاهد درس تصميم', 'goalStyle.design.audio': 'استمع لعملية مصمم',
            'goalStyle.coding.challenge': 'حل تحديًا برمجيًا حقيقيًا', 'goalStyle.coding.video': 'شاهد درسًا سريعًا', 'goalStyle.coding.reading': 'اقرأ كيف ينكسر الكود فعلًا', 'goalStyle.coding.audio': 'استمع لعقل مبرمج أسطوري',
            'goalStyle.fitness.challenge': 'مارس تمرين اليوم', 'goalStyle.fitness.video': 'اتبع فيديو تمرين',
            'goalStyle.wellness.challenge': 'مارس تمرينًا مهدّئًا', 'goalStyle.wellness.audio': 'تنفّس موجّه', 'goalStyle.wellness.reading': 'اقرأ شيئًا مطمئنًا', 'goalStyle.wellness.video': 'اتبع تمرينًا موجّهًا',
            'goalStyle.photography.creative': 'التقط صورة حسب فكرة', 'goalStyle.photography.video': 'شاهد درس تكوين', 'goalStyle.photography.challenge': 'ادرس صورًا حقيقية', 'goalStyle.photography.reading': 'اقرأ رؤية مصوّر', 'goalStyle.photography.audio': 'استمع لقصة مصوّر',
            'goalStyle.cooking.creative': 'اطبخ وصفة حقيقية', 'goalStyle.cooking.video': 'شاهد درس مهارات السكين', 'goalStyle.cooking.challenge': 'جهّز لوجبة الغد', 'goalStyle.cooking.reading': 'اقرأ نصيحة مطبخية حقيقية', 'goalStyle.cooking.audio': 'استمع لقصة طاهٍ',
            'goalStyle.entrepreneurship.challenge': 'اتخذ خطوة حقيقية واحدة', 'goalStyle.entrepreneurship.audio': 'استمع لقصة مؤسّس', 'goalStyle.entrepreneurship.creative': 'ارسم نموذج عملك', 'goalStyle.entrepreneurship.reading': 'اقرأ رؤية مؤسّس', 'goalStyle.entrepreneurship.video': 'شاهد كيف تختبر فكرتك',
            'goalStyle.sports.challenge': 'نفّذ تمرينًا حقيقيًا', 'goalStyle.sports.video': 'ادرس تسجيل مباراة حقيقية', 'goalStyle.sports.reading': 'اقرأ كيف تدرس اللعبة', 'goalStyle.sports.audio': 'استمع لعقلية مدرّب',
            'goalStyle.museums.reading': 'اقرأ قصة فنية حقيقية', 'goalStyle.museums.video': 'قم بجولة افتراضية', 'goalStyle.museums.audio': 'استمع لمؤرخ فني',
            'goalStyle.events.challenge': 'خطّط لشيء حقيقي', 'goalStyle.events.reading': 'اقرأ ما الذي يجعل التجمعات ناجحة', 'goalStyle.events.video': 'شاهد نصائح استضافة حقيقية', 'goalStyle.events.audio': 'استمع لعلم نفس التجمعات',
            'goalStyle.music.challenge': 'مارس الاستماع الفعّال', 'goalStyle.music.video': 'شاهد درسًا حقيقيًا', 'goalStyle.music.reading': 'اقرأ كيف تستمع فعلًا', 'goalStyle.music.audio': 'استمع لعرض حي',
            'goalStyle.travel.reading': 'اقرأ تأملًا في السفر', 'goalStyle.travel.challenge': 'خطّط لميزانية رحلتك', 'goalStyle.travel.creative': 'ارسم خط سير رحلة', 'goalStyle.travel.video': 'شاهد نصيحة سفر حقيقية', 'goalStyle.travel.audio': 'استمع لقصة مسافر',
            'mood.heading': 'كيف تشعر الآن؟', 'mood.sub': 'هذا يغيّر مدى طموح مسار اليوم — وليس الهدف نفسه.', 'mood.buildPath': 'ابنِ مساري',
            'moodOpt.energized.label': 'نشيط', 'moodOpt.calm.label': 'هادئ', 'moodOpt.tired.label': 'متعب',
            'moodOpt.stressed.label': 'متوتر', 'moodOpt.creative.label': 'مبدع',
            'path.heading': 'مسار اليوم', 'path.finish': 'أنهِ رحلة اليوم', 'path.pickNewFocus': 'اختر تركيزًا جديدًا',
            'path.skippingNote': 'بالمناسبة — لاحظنا أنك تتجاهل <b>%goal%</b> كثيرًا مؤخرًا. هل تريد تغيير تركيزك؟',
            'path.open': 'فتح', 'path.review': 'مراجعة', 'path.swapTooltip': 'استبدل بنشاط آخر من %goal%',
            'path.stopCount': '%n% محطة',
            'path.notesHeading': 'هل هناك شيء آخر فعلته اليوم؟', 'path.notesPlaceholder': 'اكتب ما فعلته فعليًا اليوم — حتى لو لم يكن ضمن اقتراحات اليوم.',
            'path.novaMessage': 'بما أنك تشعر بأنك %mood%، جهّزت لك %n% أشياء لمدة %time% دقيقة المتاحة لديك.',
            'path.moodFlavor.energized': 'استغلّ هذه الطاقة — تقدّم أكثر قليلًا من المعتاد.',
            'path.moodFlavor.calm': 'خذ وقتك واستمتع بالعملية.',
            'path.moodFlavor.tired': 'أبقِه خفيفًا — التقدّم الصغير يُحتسب أيضًا.',
            'path.moodFlavor.stressed': 'لست مضطرًا لفعل كل شيء اليوم. خطوة هادئة واحدة تكفي.',
            'path.moodFlavor.creative': 'اتبع الفكرة التي تبدو غريبة قليلًا. لا تحكم عليها بعد.',
            'completion.headingDefault': 'أكملت رحلة اليوم.', 'completion.headingNamed': 'أكملت رحلة اليوم، %name%.',
            'completion.subItalic': 'غادر أفضل مما وصلت.', 'completion.viewGrowth': 'شاهد نموّي',
            'completion.moreContent': 'المزيد من المحتوى', 'completion.moreContentTitle': 'لومن محدود بالتصميم',
            'completion.finiteNote': 'لومن لا يقدّم تمريرًا لا نهائيًا. عد غدًا لمسار جديد.',
            'completion.statDone': 'أُنجز اليوم', 'completion.statDaysActive': 'أيام نشطة', 'completion.statAllTime': 'الإجمالي',
            'growth.eyebrow': 'نموّك', 'growth.heading': 'الغابة التي تنمّيها', 'growth.last28': 'آخر ٢٨ يومًا',
            'growth.dayActivitiesSingular': 'نشاط واحد · %time% د', 'growth.dayActivitiesPlural': '%n% أنشطة · %time% د', 'growth.dayEmpty': 'لا يوجد نشاط مسجّل لهذا اليوم.',
            'growth.yourNoteHeading': 'ملاحظتك',
            'growth.focusMonth': 'تركيز هذا الشهر', 'growth.yourForest': 'غابتك', 'growth.badgesEarned': 'الأوسمة المكتسبة',
            'growth.buildAnother': 'ابنِ يومًا آخر', 'growth.backHome': 'العودة للرئيسية', 'growth.eraseAll': 'امسح كل شيء وابدأ من جديد',
            'growth.statCompleted': 'مكتمل', 'growth.statDaysActive': 'أيام نشطة', 'growth.statDayStreak': 'أيام متتالية',
            'growth.eraseConfirm': 'سيؤدي هذا لمسح كل أهدافك وسجلّك وأوسمتك وغابتك. هل تريد البدء من جديد تمامًا؟',
            'growth.emptyDashboard': 'أكمل بضعة أنشطة لترى لوحتك تنمو.',
            'growth.emptyForest': 'ستنمو غابتك هنا كلما أكملت أنشطة.',
            'growth.emptyNovaNamed': '%name%، لم تكمل أي شيء بعد — ابنِ مسارك الأول لتبدأ النمو.',
            'growth.emptyNova': 'لم تكمل أي شيء بعد — ابنِ مسارك الأول لتبدأ النمو.',
            'growth.topGoalSummary': '%goal% لديك ينمو بأسرع وتيرة — المستوى %level% %tier% بالفعل. حضرت %days% يوم، وأكملت %count% نشاط إجمالًا. واصل التقدّم.',
            'growth.levelLabel': 'المستوى %n% %tier%',
            'profile.growthStoryFirst': 'قصة نموّك تبدأ مع مسارك الأول.',
            'profile.growthWithGoal': '%icon% المستوى %n% %tier% في %goal% · %days% يوم من النمو%streak%',
            'profile.growthNoGoal': '%count% نشاط منجز · %days% يوم من النمو%streak%',
            'profile.streakBit': ' · سلسلة %n% أيام',
            'badge.firstStep': 'الخطوة الأولى', 'badge.tenStrong': 'عشرة أقوياء', 'badge.fiftyDeep': 'خمسون عميقة',
            'badge.weekStreak': 'سلسلة ٧ أيام', 'badge.wellRounded': 'متكامل',
            'milestone.first': 'أكمل نشاطك الأول للحصول على وسام %badge%.',
            'milestone.countSingular': 'نشاط واحد إضافي مكتمل للحصول على وسام %badge%.',
            'milestone.countPlural': '%n% أنشطة إضافية مكتملة للحصول على وسام %badge%.',
            'milestone.streakSingular': 'يوم واحد إضافي متتالٍ للحصول على وسام %badge%.',
            'milestone.streakPlural': '%n% أيام إضافية متتالية للحصول على وسام %badge%.',
            'milestone.streakToday': 'أنت على وشك إتمام سلسلة ٧ أيام — واصل اليوم.',
            'milestone.wellRounded': 'جرّب هدفًا مختلفًا في المرة القادمة للحصول على وسام %badge%.',
            'milestone.allDone': 'حصلت على كل الأوسمة حتى الآن — إنجاز رائع حقًا.',
            'tier.explorer': 'مستكشف', 'tier.builder': 'باني', 'tier.creator': 'مبدع', 'tier.master': 'خبير',
            'profile.welcomeHeading': 'أهلًا بك في لومن', 'profile.welcomeSub': 'مسار واحد قصير وحقيقي كل يوم.',
            'profile.eyebrow': 'حسابك', 'profile.signInHeading': 'تسجيل الدخول', 'profile.signInSub': 'أنشئ حسابًا مجانيًا ليتم حفظ مسار اليوم وتقدّمك.',
            'profile.signUpHeading': 'أنشئ حسابك', 'profile.createAccountBtn': 'إنشاء حساب',
            'profile.namePlaceholder': 'اسمك', 'profile.emailPlaceholder': 'you@example.com', 'profile.passwordPlaceholder': 'كلمة المرور',
            'profile.forgotPassword': 'نسيت كلمة المرور؟', 'profile.signInBtn': 'تسجيل الدخول', 'profile.or': 'أو',
            'profile.signUpBtn': 'إنشاء حساب', 'profile.emailInUse': 'هذا البريد الإلكتروني لديه حساب بالفعل — بدّل إلى تسجيل الدخول.',
            'profile.continueAsGuest': 'المتابعة كضيف',
            'profile.showPassword': 'إظهار كلمة المرور', 'profile.hidePassword': 'إخفاء كلمة المرور',
            'profile.changePhotoTitle': 'تغيير الصورة', 'profile.changePhotoAria': 'تغيير صورة الملف الشخصي', 'profile.changePhotoLink': 'تغيير الصورة',
            'profile.growthPreviewDefault': 'قصة نموّك تبدأ مع مسار اليوم.',
            'profile.displayName': 'الاسم المعروض', 'profile.namePlaceholder2': 'بما تريد أن يناديك نوفا؟',
            'profile.editSection': 'تعديل الملف الشخصي', 'profile.accountSection': 'الحساب',
            'nav.moodLabel': 'المزاج',
            'nav.audioOn': 'صوت المزاج مفعّل', 'nav.audioOff': 'صوت المزاج متوقف',
            'nav.themeToLight': 'التبديل إلى الوضع الفاتح', 'nav.themeToDark': 'التبديل إلى الوضع الداكن',
            'profile.pickAvatar': 'أو اختر صورة رمزية تعبيرية', 'profile.moreAvatars': '+%n% المزيد', 'profile.showLessAvatars': 'عرض أقل',
            'profile.saveProfile': 'حفظ الملف الشخصي', 'profile.signOut': 'تسجيل الخروج', 'profile.back': 'رجوع',
            'profile.yourProfileHeading': 'ملفك الشخصي', 'profile.yourProfileSub': 'حسابك، وصورتك، واختصار إلى نموّك.',
            'profile.savedOnDevice': 'محفوظ على هذا الجهاز',
            'profile.passwordMismatch': 'كلمة المرور هذه لا تطابق هذا البريد الإلكتروني.',
            'profile.forgotNote': 'اكتب بريدك الإلكتروني أعلاه أولًا، ثم اضغط "نسيت كلمة المرور؟" مرة أخرى للحصول على رابط إعادة التعيين.',
            'profile.signOutConfirm': 'تسجيل الخروج من لومن؟ يلزم وجود حساب لاستخدام التطبيق، لذا ستحتاج لتسجيل الدخول مجددًا.',
            'profile.continueWithGoogle': 'المتابعة بحساب جوجل',
            'profile.signInError': 'حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.',
            'profile.weakPassword': 'اختر كلمة مرور مكوّنة من 6 أحرف على الأقل.',
            'profile.invalidEmailError': 'هذا لا يبدو بريدًا إلكترونيًا صحيحًا.',
            'profile.tooManyAttempts': 'محاولات كثيرة جدًا — يرجى الانتظار قليلًا والمحاولة مرة أخرى.',
            'profile.popupBlocked': 'متصفحك منع نافذة تسجيل الدخول — اسمح بالنوافذ المنبثقة لهذا الموقع وحاول مرة أخرى.',
            'profile.unauthorizedDomain': 'هذا الموقع غير مصرّح له بتسجيل الدخول بعد — أضف هذا النطاق في Firebase Console ← Authentication ← Settings ← Authorized domains.',
            'profile.firebaseNotConfigured': 'تسجيل الدخول غير مُفعّل على هذا الموقع بعد. يرجى المحاولة لاحقًا.',
            'profile.resetEmailSent': 'تحقق من بريدك الإلكتروني للحصول على رابط إعادة تعيين كلمة المرور.',
            'overlay.close': 'إغلاق', 'overlay.markComplete': 'وضع علامة مكتمل', 'overlay.completed': 'مكتمل ✓', 'overlay.tryDifferent': 'جرّب واحدًا آخر',
            'footer.tagline': 'لومن — غادر أفضل مما وصلت.',
            'lang.switcherLabel': 'اللغة',
            'content.prefixRead': 'اقرأ: ', 'content.prefixWatch': 'شاهد: ', 'content.prefixListen': 'استمع: ', 'content.prefixCook': 'اطبخ: ', 'content.prefixDesignBrief': 'موجز تصميم: ', 'content.prefixCodeChallenge': 'تحدي برمجي: ', 'content.prefixPhotoPrompt': 'تحدي تصوير: ',
            'content.videoPlaysHere': 'يعمل هنا مباشرة — لا حاجة لمغادرة لومن.', 'content.audioStaysPage': 'اضغط تشغيل — يبقى هذا في الصفحة.',
            'content.learnWords': 'تعلّم 5 كلمات %language% تستحق المعرفة', 'content.listenRealSpoken': '%language% منطوقة حقًا — جيدة لممارسة الاستماع، قابلة للتشغيل هنا مباشرة.',
            'content.buildPalette': 'ابنِ لوحة من 5 ألوان وسمِّ دور كل لون', 'content.studyBehance': 'ادرس خيارات تخطيط علامة تجارية حقيقية على Behance', 'content.behanceLabel': 'افتح أعمال تصميم مختارة على Behance', 'content.behanceNote': 'انظر إلى المسافات والتسلسل الهرمي، وليس اللون فقط.',
            'content.readMdn': 'اقرأ صفحة واحدة من MDN عن شيء لا تعرفه تمامًا', 'content.mdnLabel': 'افتح توثيق MDN للويب', 'content.mdnNote': 'ابحث عن مفهوم استخدمته لكن لم تقرأ توثيقه من قبل.', 'content.linusNote': 'لينوس تورفالدس يتحدث عن بناء لينكس — اضغط تشغيل.',
            'content.stepOutside': 'اخرج، واترك هاتفك خلفك، لمدة 10 دقائق', 'content.stepOutside1': 'اترك هاتفك في مكان لا تسمعه فيه', 'content.stepOutside2': 'امشِ بلا وجهة لمدة 10 دقائق', 'content.stepOutside3': 'لاحظ شيئًا واحدًا كنت لتتجاوزه عادةً بالتمرير',
            'content.studyLighting': 'ادرس الإضاءة في 3 صور تعجبك', 'content.unsplashLabel': 'تصفّح Unsplash لأفكار إضاءة', 'content.paulGrahamNote': 'المصوّر بول غراهام في حوار — اضغط تشغيل.',
            'content.prepIngredient': 'جهّز مكونًا واحدًا لغدٍ', 'content.prepSteps1': 'اختر شيئًا واحدًا في قائمة طعام الغد', 'content.prepSteps2': 'اغسله أو قطّعه أو قسّمه الآن', 'content.prepSteps3': 'خزّنه في مكان سترى فيه فعلًا غدًا', 'content.danBarberNote': 'محاضرة TED للشيف دان باربر عن الطعام المستدام — اضغط تشغيل.',
            'content.sketchCanvas': 'ارسم نموذج عمل تجاري', 'content.canvasLabel': 'افتح نموذج عمل تجاري مجاني',
            'content.museumsTalkNote': 'محاضرة TED حقيقية لمؤرخة الفن إليزابيث ليف — اضغط تشغيل.',
            'content.browseEvents': 'تصفّح ما يحدث بالقرب منك', 'content.eventListingsLabel': 'افتح قوائم فعاليات محلية', 'content.priyaParkerNote': 'محاضرة TED لبريا باركر عن التجمع الجيد — اضغط تشغيل.',
            'content.learnTheory': 'تعلّم أساسية واحدة في نظرية الموسيقى', 'content.theoryLabel': 'افتح أساسيات نظرية الموسيقى', 'content.tinyDeskNote': 'أداء حقيقي من Tiny Desk — اضغط تشغيل واستمع فقط.',
            'content.seeBudget': 'اكتشف إلى أين يمكن أن تأخذك ميزانيتك فعليًا', 'content.flightsLabel': 'افتح خريطة Google Flights', 'content.sketchItinerary': 'ارسم مسار رحلة تقريبي لمدة 3 أيام في مكان جديد', 'content.itineraryLabel': 'افتح مخطط مسار رحلة مجاني', 'content.natGeoNote': 'مقابلة سفر حقيقية من ناشونال جيوغرافيك — اضغط تشغيل.',
            'content.sportsAudioNote': 'مقابلة حقيقية مع مدرب في برنامج Dan Patrick Show — اضغط تشغيل.',
            'language.Spanish': 'الإسبانية', 'language.Japanese': 'اليابانية', 'language.French': 'الفرنسية', 'language.German': 'الألمانية',
            'content.chipKiddNote': 'محاضرة TED لمصمم الكتب تشيب كيد — اضغط تشغيل.',
            'overlay.wantMoreLikeThis': 'تريد المزيد مثل هذا؟', 'overlay.wordsHeading': '%language% · %n% كلمات', 'overlay.pronounceLabel': 'انطق %word%', 'overlay.pronounceTitle': 'نطق',
            'overlay.toolsToDoThis': 'أدوات لتنفيذ هذا فعليًا', 'overlay.describeWhatMade': 'صف ما صنعته — احصل على ملاحظات', 'overlay.designFeedbackPlaceholder': 'مثال: استخدمت عنوانًا بخط سيريف عريض، ولونين، ووسّطت كل شيء...', 'overlay.getFeedback': 'احصل على ملاحظات',
            'overlay.paletteGenerated': 'إليك لوحة ألوان مكوّنة من 5 ألوان تم توليدها. سمِّ دور كل لون، ثم جرّبها في تخطيط حقيقي.', 'overlay.tryItSomewhereReal': 'جرّبها في مكان حقيقي',
            'overlay.writeFnInstruction': 'اكتب <code>%fn%</code> بحيث يجتاز كل الاختبارات أدناه، ثم اضغط تشغيل.', 'overlay.runTests': 'شغّل الاختبارات', 'overlay.stuckLearnMore': 'عالق؟ تعلّم المزيد',
            'overlay.servesTime': 'يكفي %servings% · %time% د', 'overlay.ingredients': 'المكوّنات', 'overlay.steps': 'الخطوات', 'overlay.goDeeper': 'تعمّق أكثر',
            'overlay.sharpenEyeFirst': 'اشحذ عينك أولًا', 'overlay.exploreMore': 'استكشف المزيد', 'overlay.playsHereLumen': 'يعمل هنا مباشرة، في لومن.', 'overlay.openOnYoutube': 'افتح على يوتيوب',
            'overlay.testsPassed': '%passed%/%total% اختبار ناجح', 'overlay.errorPrefix': 'خطأ:', 'overlay.expectedSuffix': '(المتوقع %expected%)', 'overlay.moreCount': '+%n% أخرى', 'overlay.goToStep': 'اذهب إلى %step%',
            'overlay.moodNote.energized': 'اختير لمزاج نشيط — شيء فيه زخم.', 'overlay.moodNote.calm': 'اختير لمزاج هادئ — لا شيء عاجل، فقط اجلس معه.',
            'overlay.moodNote.tired': 'اختير لمزاج متعب — قصير وثابت، لا شيء يحتاج مجهودًا كبيرًا.', 'overlay.moodNote.stressed': 'اختير لمزاج متوتر — صغير ومهدّئ، وليس شيئًا إضافيًا لإدارته.',
            'overlay.moodNote.creative': 'اختير لمزاج إبداعي — شيء يشعل فكرة.',
            'preview.langExample': 'مثال: "%word%" — %translation%', 'preview.livePalette': 'لوحة ألوان حية مكوّنة من 5 ألوان، تم توليدها لك', 'preview.writeChecked': 'اكتب %fn%() — يتم التحقق منه فورًا مقابل اختبارات حقيقية',
            'preview.playsHereOnPage': 'يعمل هنا مباشرة في هذه الصفحة', 'preview.ingredientsSteps': '%ing% مكونات · %steps% خطوات',
            'feedback.hierarchy': 'التسلسل الهرمي البصري', 'feedback.contrast': 'التباين (لون أو حجم)', 'feedback.spacing': 'الفراغ الأبيض / مساحة للتنفس', 'feedback.alignment': 'المحاذاة / الشبكة', 'feedback.restraint': 'ضبط الألوان والخطوط (2-3 كحد أقصى)',
            'feedback.scoreLine': '<b>%n%/5</b> من المبادئ الأساسية تظهر في وصفك.', 'feedback.worthChecking': 'يستحق التحقق قبل أن تعتبره منتهيًا:',
            'feedback.allCovered': 'لقد غطّيت القائمة الأساسية — الآن ابتعد لمدة 10 دقائق وانظر إليه مجددًا بعين جديدة. عادة ما تظهر المشاكل الحقيقية هناك.'
        },
        es: {
            'nav.home': 'Inicio', 'nav.buildPath': 'Crear tu camino', 'nav.myGrowth': 'Mi crecimiento',
            'nav.account': 'Tu cuenta', 'nav.brandHome': 'Inicio de Lumen', 'nav.back': 'Atrás',
            'welcome.headingHtml': 'Crece con <em>intención</em>.',
            'welcome.sub': 'Lumen te ayuda a crear mejores hábitos, descubrir lo que importa y llegar a ser tu mejor versión — un paso a la vez.',
            'welcome.start': 'Empezar',
            'welcome.feature1.title': 'Personalizado para ti', 'welcome.feature1.desc': 'Contenido y caminos según tus metas y tu ánimo.',
            'welcome.feature2.title': 'Crea mejores hábitos', 'welcome.feature2.desc': 'Pasos pequeños y constantes que generan un cambio real.',
            'welcome.feature3.title': 'Sigue tu crecimiento', 'welcome.feature3.desc': 'Observa cómo crecen tus rachas, insignias y tu bosque.',
            'welcome.feature4.title': 'Siéntete mejor', 'welcome.feature4.desc': 'Mente, cuerpo y metas — en equilibrio.',
            'step.prefix': 'paso',
            'goals.heading': '¿Quién quieres llegar a ser?', 'goals.sub': 'Elige un enfoque — siempre puedes cambiarlo la próxima vez.', 'goals.continue': 'Continuar',
            'identity.learner.label': 'Aprendiz de por vida', 'identity.learner.tagline': 'Lee, aprende un idioma, o disfruta un poco de arte e historia.',
            'identity.active.label': 'Sano y activo', 'identity.active.tagline': 'Mueve tu cuerpo y mejora en el deporte que amas.',
            'identity.creative.label': 'Mente creativa', 'identity.creative.tagline': 'Diseña, fotografía, cocina o toca música — crea algo hoy.',
            'identity.builder.label': 'Creador', 'identity.builder.tagline': 'Escribe un poco de código, o da un paso real hacia tu idea.',
            'identity.explorer.label': 'Explorador', 'identity.explorer.tagline': 'Planea un viaje, o busca algo cercano que valga la pena.',
            'identity.calm.label': 'Mente en calma', 'identity.calm.tagline': 'Unos minutos tranquilos y sin pantallas para tu mente.',
            'goal.reading.label': 'Lectura', 'goal.fitness.label': 'Fitness', 'goal.languages.label': 'Idiomas',
            'goal.design.label': 'Diseño gráfico', 'goal.wellness.label': 'Bienestar mental', 'goal.coding.label': 'Programación',
            'goal.photography.label': 'Fotografía', 'goal.cooking.label': 'Cocina', 'goal.entrepreneurship.label': 'Emprendimiento',
            'goal.sports.label': 'Deportes', 'goal.museums.label': 'Museos y arte', 'goal.events.label': 'Eventos',
            'goal.music.label': 'Música', 'goal.travel.label': 'Viajes',
            'goal.reading.desc': 'Un pasaje real, elegido para esta noche.', 'goal.fitness.desc': 'Movimiento que cabe en cualquier momento libre.',
            'goal.languages.desc': 'Un puñado de palabras que realmente usarás.', 'goal.design.desc': 'Un encargo real, una herramienta real, comentarios reales.',
            'goal.wellness.desc': 'Unos minutos tranquilos, sin pantallas.', 'goal.coding.desc': 'Un reto pequeño y verificable.',
            'goal.photography.desc': 'Entrena tu ojo con la cámara que llevas contigo.', 'goal.cooking.desc': 'Una receta real, del tamaño justo para hoy.',
            'goal.entrepreneurship.desc': 'Un paso concreto hacia una idea real.', 'goal.sports.desc': 'Estúdialo, practícalo, o muévete.',
            'goal.museums.desc': 'Un poco de arte o historia, sin entrada.', 'goal.events.desc': 'Encuentra o planea algo que valga la pena.',
            'goal.music.desc': 'Toca, practica, o simplemente escucha.', 'goal.travel.desc': 'Investiga, planea, o explora cerca de casa.',
            'subject.subDynamic': 'Todo aquí encaja con tu enfoque de %identity% — elige lo que se sienta bien hoy.',
            'time.heading': '¿Cuánto tiempo tienes en realidad?', 'time.sub': 'Arrastra para ajustarlo, o elige una opción rápida. Esto decide cuántas paradas tendrá tu camino.',
            'time.unit': 'min', 'time.continue': 'Continuar',
            'subject.heading': '¿Qué te apetece hoy?', 'subject.sub': 'Elige lo que se sienta bien — siempre puedes cambiar la próxima vez.', 'subject.continue': 'Continuar',
            'langStep.heading': '¿Qué idioma quieres aprender?', 'langStep.sub': 'Esto decide las palabras, el audio y el video de tu práctica de idioma de hoy.', 'langStep.continue': 'Continuar',
            'style.heading': '¿Cómo prefieres recibir el contenido?', 'style.sub': 'Priorizaremos este formato cuando la meta lo permita.', 'style.continue': 'Continuar',
            'goalStyle.reading.reading': 'Lee un pasaje real', 'goalStyle.reading.video': 'Mira un libro, visualizado', 'goalStyle.reading.audio': 'Escucha un libro',
            'goalStyle.languages.reading': 'Aprende 5 palabras reales', 'goalStyle.languages.audio': 'Escucha y pronuncia', 'goalStyle.languages.video': 'Mira una lección',
            'goalStyle.design.creative': 'Diseña algo real', 'goalStyle.design.challenge': 'Estudia trabajo real', 'goalStyle.design.reading': 'Lee sobre el pensamiento de diseño', 'goalStyle.design.video': 'Mira un tutorial de diseño', 'goalStyle.design.audio': 'Escucha el proceso de un diseñador',
            'goalStyle.coding.challenge': 'Resuelve un reto real', 'goalStyle.coding.video': 'Mira una lección rápida', 'goalStyle.coding.reading': 'Lee cómo falla el código de verdad', 'goalStyle.coding.audio': 'Escucha la mente de un programador legendario',
            'goalStyle.fitness.challenge': 'Haz el entrenamiento de hoy', 'goalStyle.fitness.video': 'Sigue un video de entrenamiento',
            'goalStyle.wellness.challenge': 'Haz un ejercicio calmante', 'goalStyle.wellness.audio': 'Respiración guiada', 'goalStyle.wellness.reading': 'Lee algo reconfortante', 'goalStyle.wellness.video': 'Sigue una práctica guiada',
            'goalStyle.photography.creative': 'Toma una foto con un reto', 'goalStyle.photography.video': 'Mira una lección de composición', 'goalStyle.photography.challenge': 'Estudia fotos reales', 'goalStyle.photography.reading': 'Lee la perspectiva de un fotógrafo', 'goalStyle.photography.audio': 'Escucha la historia de un fotógrafo',
            'goalStyle.cooking.creative': 'Cocina una receta real', 'goalStyle.cooking.video': 'Mira una lección de cuchillo', 'goalStyle.cooking.challenge': 'Prepara algo para mañana', 'goalStyle.cooking.reading': 'Lee un consejo real de cocina', 'goalStyle.cooking.audio': 'Escucha la historia de un chef',
            'goalStyle.entrepreneurship.challenge': 'Da un paso real', 'goalStyle.entrepreneurship.audio': 'Escucha la historia de un fundador', 'goalStyle.entrepreneurship.creative': 'Esboza tu modelo de negocio', 'goalStyle.entrepreneurship.reading': 'Lee la perspectiva de un fundador', 'goalStyle.entrepreneurship.video': 'Mira cómo validar una idea',
            'goalStyle.sports.challenge': 'Haz un ejercicio real', 'goalStyle.sports.video': 'Estudia vídeo real de partidos', 'goalStyle.sports.reading': 'Lee cómo estudiar el juego', 'goalStyle.sports.audio': 'Escucha la mentalidad de un entrenador',
            'goalStyle.museums.reading': 'Lee una historia de arte real', 'goalStyle.museums.video': 'Haz un recorrido virtual', 'goalStyle.museums.audio': 'Escucha a un historiador del arte',
            'goalStyle.events.challenge': 'Planea algo real', 'goalStyle.events.reading': 'Lee qué hace que las reuniones funcionen', 'goalStyle.events.video': 'Mira consejos reales para anfitriones', 'goalStyle.events.audio': 'Escucha la psicología de reunirse',
            'goalStyle.music.challenge': 'Practica la escucha activa', 'goalStyle.music.video': 'Mira una lección real', 'goalStyle.music.reading': 'Lee cómo escuchar de verdad', 'goalStyle.music.audio': 'Escucha una actuación en vivo',
            'goalStyle.travel.reading': 'Lee una reflexión de viaje', 'goalStyle.travel.challenge': 'Planea el presupuesto de tu viaje', 'goalStyle.travel.creative': 'Esboza un itinerario', 'goalStyle.travel.video': 'Mira un consejo real de viaje', 'goalStyle.travel.audio': 'Escucha la historia de un viajero',
            'mood.heading': '¿Cómo te sientes ahora mismo?', 'mood.sub': 'Esto cambia qué tan ambicioso será el camino de hoy — nunca la meta en sí.', 'mood.buildPath': 'Crear mi camino',
            'moodOpt.energized.label': 'Con energía', 'moodOpt.calm.label': 'Tranquilo', 'moodOpt.tired.label': 'Cansado',
            'moodOpt.stressed.label': 'Estresado', 'moodOpt.creative.label': 'Creativo',
            'path.heading': 'El camino de hoy', 'path.finish': 'Terminar el recorrido de hoy', 'path.pickNewFocus': 'Elegir un nuevo enfoque',
            'path.skippingNote': 'Por cierto — has estado evitando <b>%goal%</b> últimamente. ¿Quieres cambiar de enfoque?',
            'path.open': 'Abrir', 'path.review': 'Revisar', 'path.swapTooltip': 'Cambiar por otra actividad de %goal%',
            'path.stopCount': '%n% parada%s%',
            'path.notesHeading': '¿Algo más que hayas hecho hoy?', 'path.notesPlaceholder': 'Escribe lo que realmente hiciste hoy — también fuera de las sugerencias de hoy.',
            'path.novaMessage': 'ya que te sientes %mood%, preparé %n% cosa%s% para los %time% minutos que tienes.',
            'path.moodFlavor.energized': 'Aprovecha esa energía — ve un poco más allá de lo habitual.',
            'path.moodFlavor.calm': 'Tómate tu tiempo y disfruta el proceso.',
            'path.moodFlavor.tired': 'Mantenlo ligero — el progreso pequeño también cuenta.',
            'path.moodFlavor.stressed': 'No tienes que hacerlo todo hoy. Un paso tranquilo es suficiente.',
            'path.moodFlavor.creative': 'Sigue la idea que se sienta un poco fuera de lo común. Aún no la juzgues.',
            'completion.headingDefault': 'Completaste el recorrido de hoy.', 'completion.headingNamed': 'Completaste el recorrido de hoy, %name%.',
            'completion.subItalic': 'Vete mejor de como llegaste.', 'completion.viewGrowth': 'Ver mi crecimiento',
            'completion.moreContent': 'Más contenido', 'completion.moreContentTitle': 'Lumen es finito por diseño',
            'completion.finiteNote': 'Lumen no tiene scroll infinito. Vuelve mañana para un nuevo camino.',
            'completion.statDone': 'Hecho hoy', 'completion.statDaysActive': 'Días activos', 'completion.statAllTime': 'En total',
            'growth.eyebrow': 'tu crecimiento', 'growth.heading': 'El bosque que estás cultivando', 'growth.last28': 'Últimos 28 días',
            'growth.dayActivitiesSingular': '%n% actividad · %time% min', 'growth.dayActivitiesPlural': '%n% actividades · %time% min', 'growth.dayEmpty': 'No hay actividad registrada para este día.',
            'growth.yourNoteHeading': 'Tu nota',
            'growth.focusMonth': 'Enfoque este mes', 'growth.yourForest': 'Tu bosque', 'growth.badgesEarned': 'Insignias obtenidas',
            'growth.buildAnother': 'Crear otro día', 'growth.backHome': 'Volver al inicio', 'growth.eraseAll': 'Borrar todo y empezar de nuevo',
            'growth.statCompleted': 'Completado', 'growth.statDaysActive': 'Días activos', 'growth.statDayStreak': 'Racha de días',
            'growth.eraseConfirm': 'Esto borrará todas tus metas, historial, insignias y bosque. ¿Quieres empezar completamente de nuevo?',
            'growth.emptyDashboard': 'Completa algunas actividades para ver crecer tu panel.',
            'growth.emptyForest': 'Tu bosque crecerá aquí a medida que completes actividades.',
            'growth.emptyNovaNamed': "%name%, aún no has completado nada — crea tu primer camino para empezar a crecer.",
            'growth.emptyNova': "Aún no has completado nada — crea tu primer camino para empezar a crecer.",
            'growth.topGoalSummary': 'Tu %goal% es lo que más está creciendo — ya nivel %level% %tier%. Has estado activo %days% día%ds% y completaste %count% cosa%cs% en total. Sigue así.',
            'growth.levelLabel': 'Nivel %n% %tier%',
            'profile.growthStoryFirst': 'La historia de tu crecimiento empieza con tu primer camino.',
            'profile.growthWithGoal': '%icon% Nivel %n% %tier% en %goal% · %days% día%ds% creciendo%streak%',
            'profile.growthNoGoal': '%count% cosa%cs% hecha%cs% · %days% día%ds% creciendo%streak%',
            'profile.streakBit': ' · racha de %n% días',
            'badge.firstStep': 'Primer paso', 'badge.tenStrong': 'Diez fuertes', 'badge.fiftyDeep': 'Cincuenta a fondo',
            'badge.weekStreak': 'Racha de 7 días', 'badge.wellRounded': 'Bien equilibrado',
            'milestone.first': 'Completa tu primera actividad para ganar la insignia %badge%.',
            'milestone.countSingular': '%n% actividad más completada para tu insignia %badge%.',
            'milestone.countPlural': '%n% actividades más completadas para tu insignia %badge%.',
            'milestone.streakSingular': '%n% día más seguido para la insignia %badge%.',
            'milestone.streakPlural': '%n% días más seguidos para la insignia %badge%.',
            'milestone.streakToday': 'Estás a punto de lograr una racha de 7 días — sigue así hoy.',
            'milestone.wellRounded': 'Prueba una meta diferente la próxima vez para lograr la insignia %badge%.',
            'milestone.allDone': 'Has ganado todas las insignias hasta ahora — algo realmente impresionante.',
            'tier.explorer': 'Explorador', 'tier.builder': 'Creador', 'tier.creator': 'Artífice', 'tier.master': 'Maestro',
            'profile.welcomeHeading': 'Bienvenido a Lumen', 'profile.welcomeSub': 'Un camino corto y real cada día.',
            'profile.eyebrow': 'tu cuenta', 'profile.signInHeading': 'Iniciar sesión', 'profile.signInSub': 'Crea un perfil gratuito para que se guarde el camino de hoy y tu progreso.',
            'profile.signUpHeading': 'Crea tu cuenta', 'profile.createAccountBtn': 'Crear cuenta',
            'profile.namePlaceholder': 'Tu nombre', 'profile.emailPlaceholder': 'tu@ejemplo.com', 'profile.passwordPlaceholder': 'Contraseña',
            'profile.forgotPassword': '¿Olvidaste tu contraseña?', 'profile.signInBtn': 'Iniciar sesión', 'profile.or': 'o',
            'profile.signUpBtn': 'Registrarse', 'profile.emailInUse': 'Ese correo ya tiene una cuenta — cambia a Iniciar sesión.',
            'profile.continueAsGuest': 'Continuar como invitado',
            'profile.showPassword': 'Mostrar contraseña', 'profile.hidePassword': 'Ocultar contraseña',
            'profile.changePhotoTitle': 'Cambiar foto', 'profile.changePhotoAria': 'Cambiar foto de perfil', 'profile.changePhotoLink': 'Cambiar foto',
            'profile.growthPreviewDefault': 'La historia de tu crecimiento empieza con el camino de hoy.',
            'profile.displayName': 'Nombre visible', 'profile.namePlaceholder2': '¿Cómo debería llamarte Nova?',
            'profile.editSection': 'Editar perfil', 'profile.accountSection': 'Cuenta',
            'nav.moodLabel': 'Ánimo',
            'nav.audioOn': 'Sonido de ánimo activado', 'nav.audioOff': 'Sonido de ánimo desactivado',
            'nav.themeToLight': 'Cambiar a modo claro', 'nav.themeToDark': 'Cambiar a modo oscuro',
            'profile.pickAvatar': 'O elige un avatar con emoji', 'profile.moreAvatars': '+%n% más', 'profile.showLessAvatars': 'Ver menos',
            'profile.saveProfile': 'Guardar perfil', 'profile.signOut': 'Cerrar sesión', 'profile.back': 'Atrás',
            'profile.yourProfileHeading': 'Tu perfil', 'profile.yourProfileSub': 'Tu cuenta, tu foto y un acceso directo a tu crecimiento.',
            'profile.savedOnDevice': 'Guardado en este dispositivo',
            'profile.passwordMismatch': 'Esa contraseña no coincide con este correo.',
            'profile.forgotNote': 'Escribe tu correo arriba primero, luego toca "¿Olvidaste tu contraseña?" de nuevo para recibir un enlace.',
            'profile.signOutConfirm': '¿Cerrar sesión de Lumen? Se necesita un perfil para usar la app, así que tendrás que iniciar sesión de nuevo.',
            'profile.continueWithGoogle': 'Continuar con Google',
            'profile.signInError': 'Algo salió mal al iniciar sesión. Inténtalo de nuevo.',
            'profile.weakPassword': 'Elige una contraseña de al menos 6 caracteres.',
            'profile.invalidEmailError': 'Eso no parece una dirección de correo válida.',
            'profile.tooManyAttempts': 'Demasiados intentos — espera un momento y vuelve a intentarlo.',
            'profile.popupBlocked': 'Tu navegador bloqueó la ventana de inicio de sesión — permite las ventanas emergentes para este sitio e inténtalo de nuevo.',
            'profile.unauthorizedDomain': 'Este sitio aún no está autorizado para iniciar sesión — agrega este dominio en Firebase Console → Authentication → Settings → Authorized domains.',
            'profile.firebaseNotConfigured': 'El inicio de sesión aún no está disponible en este sitio. Inténtalo más tarde.',
            'profile.resetEmailSent': 'Revisa tu correo para ver el enlace para restablecer tu contraseña.',
            'overlay.close': 'Cerrar', 'overlay.markComplete': 'Marcar como completado', 'overlay.completed': 'Completado ✓', 'overlay.tryDifferent': 'Probar otro',
            'footer.tagline': 'Lumen — vete mejor de como llegaste.',
            'lang.switcherLabel': 'Idioma',
            'content.prefixRead': 'Leer: ', 'content.prefixWatch': 'Ver: ', 'content.prefixListen': 'Escuchar: ', 'content.prefixCook': 'Cocinar: ', 'content.prefixDesignBrief': 'Brief de diseño: ', 'content.prefixCodeChallenge': 'Reto de código: ', 'content.prefixPhotoPrompt': 'Reto de foto: ',
            'content.videoPlaysHere': 'Se reproduce aquí mismo — no hace falta salir de Lumen.', 'content.audioStaysPage': 'Presiona play — esto se queda en la página.',
            'content.learnWords': 'Aprende 5 palabras en %language% que vale la pena saber', 'content.listenRealSpoken': '%language% real hablado — bueno para practicar el oído, reproducible aquí mismo.',
            'content.buildPalette': 'Crea una paleta de 5 colores y nombra el rol de cada uno', 'content.studyBehance': 'Estudia las decisiones de diseño de una marca real en Behance', 'content.behanceLabel': 'Abrir trabajos de diseño destacados en Behance', 'content.behanceNote': 'Fíjate en el espaciado y la jerarquía, no solo en el color.',
            'content.readMdn': 'Lee una página de MDN sobre algo que no domines del todo', 'content.mdnLabel': 'Abrir MDN Web Docs', 'content.mdnNote': 'Busca un concepto que hayas usado pero cuya documentación nunca hayas leído.', 'content.linusNote': 'Linus Torvalds sobre la creación de Linux — presiona play.',
            'content.stepOutside': 'Sal, deja el teléfono, durante 10 minutos', 'content.stepOutside1': 'Deja tu teléfono donde no puedas oírlo', 'content.stepOutside2': 'Camina sin destino durante 10 minutos', 'content.stepOutside3': 'Nota algo que normalmente pasarías de largo',
            'content.studyLighting': 'Estudia la iluminación en 3 fotos que admires', 'content.unsplashLabel': 'Explora Unsplash en busca de ideas de iluminación', 'content.paulGrahamNote': 'El fotógrafo Paul Graham en conversación — presiona play.',
            'content.prepIngredient': 'Prepara un ingrediente para mañana', 'content.prepSteps1': 'Elige algo del menú de mañana', 'content.prepSteps2': 'Lávalo, córtalo o pórcionalo ahora', 'content.prepSteps3': 'Guárdalo donde realmente lo veas mañana', 'content.danBarberNote': 'Charla TED del chef Dan Barber sobre comida sostenible — presiona play.',
            'content.sketchCanvas': 'Esboza un lienzo de modelo de negocio', 'content.canvasLabel': 'Abrir un lienzo de modelo de negocio gratuito',
            'content.museumsTalkNote': 'Una charla TED real de la historiadora de arte Elizabeth Lev — presiona play.',
            'content.browseEvents': 'Explora lo que está pasando cerca de ti', 'content.eventListingsLabel': 'Abrir cartelera de eventos locales', 'content.priyaParkerNote': 'La charla TED de Priya Parker sobre cómo reunirse bien — presiona play.',
            'content.learnTheory': 'Aprende un fundamento de teoría musical', 'content.theoryLabel': 'Abrir fundamentos de teoría musical', 'content.tinyDeskNote': 'Una actuación real de Tiny Desk — presiona play y solo escucha.',
            'content.seeBudget': 'Descubre a dónde podría llevarte realmente tu presupuesto', 'content.flightsLabel': 'Abrir el mapa de Google Flights', 'content.sketchItinerary': 'Esboza un itinerario aproximado de 3 días en un lugar nuevo', 'content.itineraryLabel': 'Abrir un planificador de itinerarios gratuito', 'content.natGeoNote': 'Una entrevista de viajes real de National Geographic — presiona play.',
            'content.sportsAudioNote': 'Una entrevista real a un entrenador en el Dan Patrick Show — presiona play.',
            'language.Spanish': 'español', 'language.Japanese': 'japonés', 'language.French': 'francés', 'language.German': 'alemán',
            'content.chipKiddNote': "Charla TED del diseñador de libros Chip Kidd — presiona play.",
            'overlay.wantMoreLikeThis': '¿Quieres más como esto?', 'overlay.wordsHeading': '%language% · %n% palabras', 'overlay.pronounceLabel': 'Pronunciar %word%', 'overlay.pronounceTitle': 'Pronunciar',
            'overlay.toolsToDoThis': 'Herramientas para hacerlo de verdad', 'overlay.describeWhatMade': 'Describe lo que hiciste — recibe feedback', 'overlay.designFeedbackPlaceholder': 'p. ej. Usé un titular serif en negrita, dos colores, y centré todo...', 'overlay.getFeedback': 'Obtener feedback',
            'overlay.paletteGenerated': 'Aquí tienes una paleta de 5 colores generada. Nombra para qué sirve cada color y luego pruébala en un diseño real.', 'overlay.tryItSomewhereReal': 'Pruébala en algo real',
            'overlay.writeFnInstruction': 'Escribe <code>%fn%</code> para que pase todas las pruebas de abajo, luego pulsa Ejecutar.', 'overlay.runTests': 'Ejecutar pruebas', 'overlay.stuckLearnMore': '¿Atascado? Aprende más',
            'overlay.servesTime': 'Para %servings% · %time% min', 'overlay.ingredients': 'Ingredientes', 'overlay.steps': 'Pasos', 'overlay.goDeeper': 'Profundiza más',
            'overlay.sharpenEyeFirst': 'Afina tu ojo primero', 'overlay.exploreMore': 'Explora más', 'overlay.playsHereLumen': 'Se reproduce aquí mismo, en Lumen.', 'overlay.openOnYoutube': 'Abrir en YouTube',
            'overlay.testsPassed': '%passed%/%total% pruebas superadas', 'overlay.errorPrefix': 'Error:', 'overlay.expectedSuffix': '(se esperaba %expected%)', 'overlay.moreCount': '+%n% más', 'overlay.goToStep': 'Ir a %step%',
            'overlay.moodNote.energized': 'Elegido para un ánimo con energía — algo con impulso.', 'overlay.moodNote.calm': 'Elegido para un ánimo tranquilo — nada urgente, solo siéntate con ello.',
            'overlay.moodNote.tired': 'Elegido para un ánimo cansado — corto y estable, nada que forzar.', 'overlay.moodNote.stressed': 'Elegido para un ánimo estresado — pequeño y calmante, no una cosa más que gestionar.',
            'overlay.moodNote.creative': 'Elegido para un ánimo creativo — algo que encienda una idea.',
            'preview.langExample': 'p. ej. "%word%" — %translation%', 'preview.livePalette': 'Una paleta de 5 colores en vivo, generada para ti', 'preview.writeChecked': 'Escribe %fn%() — verificado al instante contra pruebas reales',
            'preview.playsHereOnPage': 'Se reproduce aquí mismo, en esta página', 'preview.ingredientsSteps': '%ing% ingredientes · %steps% pasos',
            'feedback.hierarchy': 'Jerarquía visual', 'feedback.contrast': 'Contraste (color o tamaño)', 'feedback.spacing': 'Espacio en blanco / aire', 'feedback.alignment': 'Alineación / cuadrícula', 'feedback.restraint': 'Contención de color y tipografía (2–3 máx.)',
            'feedback.scoreLine': '<b>%n%/5</b> principios clave aparecen en tu descripción.', 'feedback.worthChecking': 'Vale la pena revisar antes de darlo por terminado:',
            'feedback.allCovered': 'Has cubierto la lista básica — ahora aléjate 10 minutos y míralo de nuevo con ojos frescos. Ahí es donde suelen aparecer los problemas reales.'
        },
        fr: {
            'nav.home': 'Accueil', 'nav.buildPath': 'Créer ton parcours', 'nav.myGrowth': 'Ma progression',
            'nav.account': 'Ton compte', 'nav.brandHome': 'Accueil Lumen', 'nav.back': 'Retour',
            'welcome.headingHtml': 'Grandis avec <em>intention</em>.',
            'welcome.sub': "Lumen t'aide à créer de meilleures habitudes, découvrir ce qui compte, et devenir la meilleure version de toi-même — un pas à la fois.",
            'welcome.start': 'Commencer',
            'welcome.feature1.title': 'Personnalisé pour toi', 'welcome.feature1.desc': 'Contenus et parcours basés sur tes objectifs et ton humeur.',
            'welcome.feature2.title': 'Crée de meilleures habitudes', 'welcome.feature2.desc': 'Des petits pas constants qui créent un vrai changement.',
            'welcome.feature3.title': 'Suis ta progression', 'welcome.feature3.desc': 'Regarde tes séries, tes badges et ta forêt grandir.',
            'welcome.feature4.title': 'Sens-toi au mieux', 'welcome.feature4.desc': 'Esprit, corps et objectifs — en équilibre.',
            'step.prefix': 'étape',
            'goals.heading': 'Qui veux-tu devenir ?', 'goals.sub': 'Choisis un objectif — tu pourras toujours en changer la prochaine fois.', 'goals.continue': 'Continuer',
            'identity.learner.label': 'Apprenant à vie', 'identity.learner.tagline': "Lis, apprends une langue, ou découvre un peu d'art et d'histoire.",
            'identity.active.label': 'Sain et actif', 'identity.active.tagline': 'Bouge ton corps, et progresse dans le sport que tu aimes.',
            'identity.creative.label': 'Esprit créatif', 'identity.creative.tagline': "Dessine, photographie, cuisine ou joue de la musique — crée quelque chose aujourd'hui.",
            'identity.builder.label': 'Bâtisseur', 'identity.builder.tagline': 'Écris un peu de code, ou fais un vrai pas vers ton idée.',
            'identity.explorer.label': 'Explorateur', 'identity.explorer.tagline': "Prévois un voyage, ou trouve quelque chose de proche qui vaut le déplacement.",
            'identity.calm.label': 'Esprit calme', 'identity.calm.tagline': "Quelques minutes tranquilles, sans écran, pour ton esprit.",
            'goal.reading.label': 'Lecture', 'goal.fitness.label': 'Fitness', 'goal.languages.label': 'Langues',
            'goal.design.label': 'Design graphique', 'goal.wellness.label': 'Bien-être mental', 'goal.coding.label': 'Programmation',
            'goal.photography.label': 'Photographie', 'goal.cooking.label': 'Cuisine', 'goal.entrepreneurship.label': 'Entrepreneuriat',
            'goal.sports.label': 'Sport', 'goal.museums.label': 'Musées et art', 'goal.events.label': 'Événements',
            'goal.music.label': 'Musique', 'goal.travel.label': 'Voyage',
            'goal.reading.desc': 'Un vrai texte, choisi pour ce soir.', 'goal.fitness.desc': 'Du mouvement qui tient dans le temps que tu as.',
            'goal.languages.desc': 'Une poignée de mots que tu utiliseras vraiment.', 'goal.design.desc': 'Un vrai brief, un vrai outil, de vrais retours.',
            'goal.wellness.desc': 'Quelques minutes calmes, sans écran.', 'goal.coding.desc': 'Un petit défi vérifiable.',
            'goal.photography.desc': 'Entraîne ton œil avec l\'appareil que tu as en poche.', 'goal.cooking.desc': 'Une vraie recette, à la bonne taille pour ce soir.',
            'goal.entrepreneurship.desc': 'Une étape concrète vers une vraie idée.', 'goal.sports.desc': 'Étudie-le, entraîne-toi, ou bouge.',
            'goal.museums.desc': "Un peu d'art ou d'histoire, sans billet.", 'goal.events.desc': 'Trouve ou prévois quelque chose qui en vaut la peine.',
            'goal.music.desc': 'Joue, entraîne-toi, ou écoute vraiment.', 'goal.travel.desc': 'Renseigne-toi, planifie, ou explore près de chez toi.',
            'subject.subDynamic': 'Tout ici correspond à ton objectif %identity% — choisis ce qui te convient aujourd\'hui.',
            'time.heading': 'Combien de temps as-tu vraiment ?', 'time.sub': 'Fais glisser pour régler, ou choisis une durée prédéfinie. Cela détermine le nombre d\'étapes de ton parcours.',
            'time.unit': 'min', 'time.continue': 'Continuer',
            'subject.heading': "De quoi as-tu envie aujourd'hui ?", 'subject.sub': 'Choisis ce qui te convient — tu pourras toujours changer la prochaine fois.', 'subject.continue': 'Continuer',
            'langStep.heading': 'Quelle langue veux-tu apprendre ?', 'langStep.sub': "Cela détermine les mots, l'audio et la vidéo de ta pratique de langue d'aujourd'hui.", 'langStep.continue': 'Continuer',
            'style.heading': 'Comment préfères-tu recevoir le contenu ?', 'style.sub': "On privilégiera ce format chaque fois qu'un objectif s'y prête.", 'style.continue': 'Continuer',
            'goalStyle.reading.reading': 'Lis un vrai texte', 'goalStyle.reading.video': 'Regarde un livre, en vidéo', 'goalStyle.reading.audio': 'Écoute un livre',
            'goalStyle.languages.reading': 'Apprends 5 vrais mots', 'goalStyle.languages.audio': 'Écoute et prononce', 'goalStyle.languages.video': 'Regarde une leçon',
            'goalStyle.design.creative': 'Conçois quelque chose de réel', 'goalStyle.design.challenge': 'Étudie du vrai travail', 'goalStyle.design.reading': 'Lis une réflexion sur le design', 'goalStyle.design.video': 'Regarde un tutoriel de design', 'goalStyle.design.audio': "Écoute le processus d'un designer",
            'goalStyle.coding.challenge': 'Résous un vrai défi', 'goalStyle.coding.video': 'Regarde une leçon rapide', 'goalStyle.coding.reading': 'Lis comment le code plante vraiment', 'goalStyle.coding.audio': "Écoute l'esprit d'un développeur légendaire",
            'goalStyle.fitness.challenge': "Fais l'entraînement du jour", 'goalStyle.fitness.video': "Suis une vidéo d'entraînement",
            'goalStyle.wellness.challenge': 'Fais un exercice apaisant', 'goalStyle.wellness.audio': 'Respiration guidée', 'goalStyle.wellness.reading': "Lis quelque chose d'apaisant", 'goalStyle.wellness.video': 'Suis une pratique guidée',
            'goalStyle.photography.creative': "Prends une photo à partir d'une consigne", 'goalStyle.photography.video': 'Regarde une leçon de composition', 'goalStyle.photography.challenge': 'Étudie de vraies photos', 'goalStyle.photography.reading': "Lis le point de vue d'un photographe", 'goalStyle.photography.audio': "Écoute l'histoire d'un photographe",
            'goalStyle.cooking.creative': 'Cuisine une vraie recette', 'goalStyle.cooking.video': 'Regarde une leçon de couteau', 'goalStyle.cooking.challenge': 'Prépare quelque chose pour demain', 'goalStyle.cooking.reading': 'Lis une vraie astuce de cuisine', 'goalStyle.cooking.audio': "Écoute l'histoire d'un chef",
            'goalStyle.entrepreneurship.challenge': 'Fais un vrai pas', 'goalStyle.entrepreneurship.audio': "Écoute l'histoire d'un fondateur", 'goalStyle.entrepreneurship.creative': 'Esquisse ton modèle économique', 'goalStyle.entrepreneurship.reading': "Lis le point de vue d'un fondateur", 'goalStyle.entrepreneurship.video': 'Regarde comment valider une idée',
            'goalStyle.sports.challenge': 'Fais un vrai exercice', 'goalStyle.sports.video': 'Étudie de vraies images de match', 'goalStyle.sports.reading': 'Lis comment étudier le jeu', 'goalStyle.sports.audio': "Écoute l'état d'esprit d'un entraîneur",
            'goalStyle.museums.reading': "Lis une vraie histoire d'art", 'goalStyle.museums.video': 'Fais une visite virtuelle', 'goalStyle.museums.audio': "Écoute un historien de l'art",
            'goalStyle.events.challenge': 'Planifie quelque chose de réel', 'goalStyle.events.reading': "Lis ce qui fait réussir un rassemblement", 'goalStyle.events.video': "Regarde de vrais conseils d'accueil", 'goalStyle.events.audio': 'Écoute la psychologie du rassemblement',
            'goalStyle.music.challenge': "Pratique l'écoute active", 'goalStyle.music.video': 'Regarde une vraie leçon', 'goalStyle.music.reading': 'Lis comment vraiment écouter', 'goalStyle.music.audio': 'Écoute une performance live',
            'goalStyle.travel.reading': 'Lis une réflexion sur le voyage', 'goalStyle.travel.challenge': 'Planifie le budget de ton voyage', 'goalStyle.travel.creative': 'Esquisse un itinéraire', 'goalStyle.travel.video': 'Regarde un vrai conseil de voyage', 'goalStyle.travel.audio': "Écoute l'histoire d'un voyageur",
            'mood.heading': 'Comment te sens-tu en ce moment ?', 'mood.sub': "Cela change l'ambition du parcours du jour — jamais l'objectif lui-même.", 'mood.buildPath': 'Créer mon parcours',
            'moodOpt.energized.label': 'Énergique', 'moodOpt.calm.label': 'Calme', 'moodOpt.tired.label': 'Fatigué',
            'moodOpt.stressed.label': 'Stressé', 'moodOpt.creative.label': 'Créatif',
            'path.heading': 'Le parcours du jour', 'path.finish': "Terminer le parcours du jour", 'path.pickNewFocus': 'Choisir un nouvel objectif',
            'path.skippingNote': "Au fait — tu évites <b>%goal%</b> assez souvent ces derniers temps. Tu veux changer d'objectif ?",
            'path.open': 'Ouvrir', 'path.review': 'Revoir', 'path.swapTooltip': "Remplacer par une autre activité de %goal%",
            'path.stopCount': '%n% arrêt%s%',
            'path.notesHeading': "Autre chose que tu as fait aujourd'hui ?", 'path.notesPlaceholder': "Note ce que tu as vraiment fait aujourd'hui — en dehors des suggestions du jour aussi.",
            'path.novaMessage': "comme tu te sens %mood%, j'ai préparé %n% chose%s% pour les %time% minutes dont tu disposes.",
            'path.moodFlavor.energized': "Profite de cette énergie — va un peu plus loin que d'habitude.",
            'path.moodFlavor.calm': 'Prends ton temps et profite du processus.',
            'path.moodFlavor.tired': 'Garde ça léger — les petits progrès comptent aussi.',
            'path.moodFlavor.stressed': "Tu n'as pas besoin de tout faire aujourd'hui. Un pas tranquille suffit.",
            'path.moodFlavor.creative': "Suis l'idée qui semble un peu inhabituelle. Ne la juge pas encore.",
            'completion.headingDefault': "Tu as terminé le parcours du jour.", 'completion.headingNamed': "Tu as terminé le parcours du jour, %name%.",
            'completion.subItalic': 'Repars mieux que tu n\'es arrivé.', 'completion.viewGrowth': 'Voir ma progression',
            'completion.moreContent': 'Plus de contenu', 'completion.moreContentTitle': 'Lumen est fini par conception',
            'completion.finiteNote': "Lumen ne propose pas de défilement infini. Reviens demain pour un nouveau parcours.",
            'completion.statDone': "Fait aujourd'hui", 'completion.statDaysActive': 'Jours actifs', 'completion.statAllTime': 'Au total',
            'growth.eyebrow': 'ta progression', 'growth.heading': 'La forêt que tu fais pousser', 'growth.last28': 'Les 28 derniers jours',
            'growth.dayActivitiesSingular': '%n% activité · %time% min', 'growth.dayActivitiesPlural': '%n% activités · %time% min', 'growth.dayEmpty': 'Aucune activité enregistrée pour ce jour.',
            'growth.yourNoteHeading': 'Ta note',
            'growth.focusMonth': 'Focus ce mois-ci', 'growth.yourForest': 'Ta forêt', 'growth.badgesEarned': 'Badges obtenus',
            'growth.buildAnother': 'Créer un autre jour', 'growth.backHome': "Retour à l'accueil", 'growth.eraseAll': 'Tout effacer et recommencer',
            'growth.statCompleted': 'Complété', 'growth.statDaysActive': 'Jours actifs', 'growth.statDayStreak': 'Série de jours',
            'growth.eraseConfirm': 'Cela effacera tous tes objectifs, ton historique, tes badges et ta forêt. Veux-tu vraiment recommencer à zéro ?',
            'growth.emptyDashboard': 'Termine quelques activités pour voir ton tableau de bord grandir.',
            'growth.emptyForest': 'Ta forêt poussera ici au fur et à mesure de tes activités.',
            'growth.emptyNovaNamed': "%name%, tu n'as encore rien terminé — crée ton premier parcours pour commencer à grandir.",
            'growth.emptyNova': "Tu n'as encore rien terminé — crée ton premier parcours pour commencer à grandir.",
            'growth.topGoalSummary': 'Ton objectif %goal% progresse le plus vite — déjà niveau %level% %tier%. Tu es venu %days% jour%ds% et as terminé %count% chose%cs% au total. Continue comme ça.',
            'growth.levelLabel': 'Niveau %n% %tier%',
            'profile.growthStoryFirst': "L'histoire de ta progression commence avec ton premier parcours.",
            'profile.growthWithGoal': '%icon% Niveau %n% %tier% en %goal% · %days% jour%ds% de progression%streak%',
            'profile.growthNoGoal': '%count% chose%cs% faite%cs% · %days% jour%ds% de progression%streak%',
            'profile.streakBit': ' · série de %n% jours',
            'badge.firstStep': 'Premier pas', 'badge.tenStrong': 'Dix costauds', 'badge.fiftyDeep': 'Cinquante en profondeur',
            'badge.weekStreak': 'Série de 7 jours', 'badge.wellRounded': 'Bien équilibré',
            'milestone.first': 'Termine ta première activité pour obtenir le badge %badge%.',
            'milestone.countSingular': '%n% activité de plus à terminer pour le badge %badge%.',
            'milestone.countPlural': '%n% activités de plus à terminer pour le badge %badge%.',
            'milestone.streakSingular': '%n% jour de plus d\'affilée pour le badge %badge%.',
            'milestone.streakPlural': '%n% jours de plus d\'affilée pour le badge %badge%.',
            'milestone.streakToday': "Tu es tout près d'une série de 7 jours — continue aujourd'hui.",
            'milestone.wellRounded': 'Essaie un autre objectif la prochaine fois pour obtenir le badge %badge%.',
            'milestone.allDone': 'Tu as obtenu tous les badges jusqu\'ici — vraiment impressionnant.',
            'tier.explorer': 'Explorateur', 'tier.builder': 'Bâtisseur', 'tier.creator': 'Créateur', 'tier.master': 'Maître',
            'profile.welcomeHeading': 'Bienvenue sur Lumen', 'profile.welcomeSub': 'Un parcours court et réel, chaque jour.',
            'profile.eyebrow': 'ton compte', 'profile.signInHeading': 'Se connecter', 'profile.signInSub': "Crée un profil gratuit pour que le parcours du jour et ta progression soient sauvegardés.",
            'profile.signUpHeading': 'Crée ton compte', 'profile.createAccountBtn': 'Créer un compte',
            'profile.namePlaceholder': 'Ton prénom', 'profile.emailPlaceholder': 'toi@exemple.com', 'profile.passwordPlaceholder': 'Mot de passe',
            'profile.forgotPassword': 'Mot de passe oublié ?', 'profile.signInBtn': 'Se connecter', 'profile.or': 'ou',
            'profile.signUpBtn': "S'inscrire", 'profile.emailInUse': "Cet e-mail a déjà un compte — passe à Se connecter.",
            'profile.continueAsGuest': 'Continuer en tant qu\'invité',
            'profile.showPassword': 'Afficher le mot de passe', 'profile.hidePassword': 'Masquer le mot de passe',
            'profile.changePhotoTitle': 'Changer la photo', 'profile.changePhotoAria': 'Changer la photo de profil', 'profile.changePhotoLink': 'Changer la photo',
            'profile.growthPreviewDefault': "L'histoire de ta progression commence avec le parcours du jour.",
            'profile.displayName': "Nom affiché", 'profile.namePlaceholder2': 'Comment Nova doit-il t\'appeler ?',
            'profile.editSection': 'Modifier le profil', 'profile.accountSection': 'Compte',
            'nav.moodLabel': 'Humeur',
            'nav.audioOn': "Son d'ambiance activé", 'nav.audioOff': "Son d'ambiance désactivé",
            'nav.themeToLight': 'Passer au mode clair', 'nav.themeToDark': 'Passer au mode sombre',
            'profile.pickAvatar': 'Ou choisis un avatar emoji', 'profile.moreAvatars': '+%n% de plus', 'profile.showLessAvatars': 'Afficher moins',
            'profile.saveProfile': 'Enregistrer le profil', 'profile.signOut': 'Se déconnecter', 'profile.back': 'Retour',
            'profile.yourProfileHeading': 'Ton profil', 'profile.yourProfileSub': 'Ton compte, ta photo, et un raccourci vers ta progression.',
            'profile.savedOnDevice': 'Enregistré sur cet appareil',
            'profile.passwordMismatch': 'Ce mot de passe ne correspond pas à cet e-mail.',
            'profile.forgotNote': "Écris ton e-mail ci-dessus d'abord, puis appuie de nouveau sur \"Mot de passe oublié ?\" pour recevoir un lien.",
            'profile.signOutConfirm': "Se déconnecter de Lumen ? Un profil est nécessaire pour utiliser l'appli, tu devras donc te reconnecter.",
            'profile.continueWithGoogle': 'Continuer avec Google',
            'profile.signInError': "Une erreur s'est produite lors de la connexion. Réessaie.",
            'profile.weakPassword': 'Choisis un mot de passe d\'au moins 6 caractères.',
            'profile.invalidEmailError': "Cela ne ressemble pas à une adresse e-mail valide.",
            'profile.tooManyAttempts': "Trop de tentatives — patiente un instant puis réessaie.",
            'profile.popupBlocked': "Ton navigateur a bloqué la fenêtre de connexion — autorise les popups pour ce site et réessaie.",
            'profile.unauthorizedDomain': "Ce site n'est pas encore autorisé pour la connexion — ajoute ce domaine dans Firebase Console → Authentication → Settings → Authorized domains.",
            'profile.firebaseNotConfigured': "La connexion n'est pas encore configurée sur ce site. Réessaie plus tard.",
            'profile.resetEmailSent': 'Vérifie tes e-mails pour le lien de réinitialisation du mot de passe.',
            'overlay.close': 'Fermer', 'overlay.markComplete': 'Marquer comme terminé', 'overlay.completed': 'Terminé ✓', 'overlay.tryDifferent': 'Essayer autre chose',
            'footer.tagline': "Lumen — repars mieux que tu n'es arrivé.",
            'lang.switcherLabel': 'Langue',
            'content.prefixRead': 'Lire : ', 'content.prefixWatch': 'Regarder : ', 'content.prefixListen': 'Écouter : ', 'content.prefixCook': 'Cuisiner : ', 'content.prefixDesignBrief': 'Brief de design : ', 'content.prefixCodeChallenge': 'Défi de code : ', 'content.prefixPhotoPrompt': 'Défi photo : ',
            'content.videoPlaysHere': 'Se lit directement ici — pas besoin de quitter Lumen.', 'content.audioStaysPage': 'Appuie sur lecture — ça reste sur la page.',
            'content.learnWords': 'Apprends 5 mots en %language% qui valent le coup', 'content.listenRealSpoken': 'Du vrai %language% parlé — idéal pour l\'écoute, lisible directement ici.',
            'content.buildPalette': 'Crée une palette de 5 couleurs et nomme le rôle de chacune', 'content.studyBehance': 'Étudie les choix de mise en page d\'une vraie marque sur Behance', 'content.behanceLabel': 'Ouvrir des travaux de design sélectionnés sur Behance', 'content.behanceNote': 'Observe les espacements et la hiérarchie, pas seulement la couleur.',
            'content.readMdn': 'Lis une page MDN sur quelque chose que tu ne maîtrises pas totalement', 'content.mdnLabel': 'Ouvrir la doc MDN Web Docs', 'content.mdnNote': 'Cherche un concept que tu as utilisé sans jamais lire sa documentation.', 'content.linusNote': 'Linus Torvalds sur la création de Linux — appuie sur lecture.',
            'content.stepOutside': 'Sors, sans ton téléphone, pendant 10 minutes', 'content.stepOutside1': "Laisse ton téléphone quelque part où tu ne l'entends pas", 'content.stepOutside2': 'Marche sans destination pendant 10 minutes', 'content.stepOutside3': 'Remarque une chose que tu ignorerais normalement en faisant défiler ton flux',
            'content.studyLighting': 'Étudie l\'éclairage sur 3 photos que tu admires', 'content.unsplashLabel': 'Parcourir Unsplash pour des idées de lumière', 'content.paulGrahamNote': 'Le photographe Paul Graham en conversation — appuie sur lecture.',
            'content.prepIngredient': 'Prépare un ingrédient pour demain', 'content.prepSteps1': 'Choisis une chose au menu de demain', 'content.prepSteps2': 'Lave-la, coupe-la ou portionne-la maintenant', 'content.prepSteps3': 'Range-la quelque part où tu la verras vraiment demain', 'content.danBarberNote': 'La conférence TED du chef Dan Barber sur l\'alimentation durable — appuie sur lecture.',
            'content.sketchCanvas': 'Esquisse un business model canvas', 'content.canvasLabel': 'Ouvrir un business model canvas gratuit',
            'content.museumsTalkNote': 'Une vraie conférence TED de l\'historienne de l\'art Elizabeth Lev — appuie sur lecture.',
            'content.browseEvents': 'Découvre ce qui se passe près de toi', 'content.eventListingsLabel': 'Ouvrir les annonces d\'événements locaux', 'content.priyaParkerNote': 'La conférence TED de Priya Parker sur l\'art de bien se rassembler — appuie sur lecture.',
            'content.learnTheory': 'Apprends une base de théorie musicale', 'content.theoryLabel': 'Ouvrir les bases de théorie musicale', 'content.tinyDeskNote': 'Une vraie performance Tiny Desk — appuie sur lecture et écoute, c\'est tout.',
            'content.seeBudget': 'Découvre où ton budget pourrait vraiment t\'emmener', 'content.flightsLabel': 'Ouvrir la carte Google Flights', 'content.sketchItinerary': 'Esquisse un itinéraire approximatif de 3 jours quelque part de nouveau', 'content.itineraryLabel': 'Ouvrir un planificateur d\'itinéraire gratuit', 'content.natGeoNote': 'Une vraie interview de voyage de National Geographic — appuie sur lecture.',
            'content.sportsAudioNote': 'Une vraie interview d\'entraîneur sur le Dan Patrick Show — appuie sur lecture.',
            'language.Spanish': 'espagnol', 'language.Japanese': 'japonais', 'language.French': 'français', 'language.German': 'allemand',
            'content.chipKiddNote': "La conférence TED du designer de livres Chip Kidd — appuie sur lecture.",
            'overlay.wantMoreLikeThis': 'Tu veux plus de ça ?', 'overlay.wordsHeading': '%language% · %n% mots', 'overlay.pronounceLabel': 'Prononcer %word%', 'overlay.pronounceTitle': 'Prononcer',
            'overlay.toolsToDoThis': 'Des outils pour le faire vraiment', 'overlay.describeWhatMade': 'Décris ce que tu as fait — reçois un retour', 'overlay.designFeedbackPlaceholder': "ex. J'ai utilisé un titre serif en gras, deux couleurs, et tout centré...", 'overlay.getFeedback': 'Obtenir un retour',
            'overlay.paletteGenerated': "Voici une palette de 5 couleurs générée. Nomme le rôle de chaque couleur, puis essaie-la dans une vraie mise en page.", 'overlay.tryItSomewhereReal': 'Essaie-la quelque part de réel',
            'overlay.writeFnInstruction': "Écris <code>%fn%</code> pour qu'elle réussisse tous les tests ci-dessous, puis appuie sur Exécuter.", 'overlay.runTests': 'Exécuter les tests', 'overlay.stuckLearnMore': 'Bloqué ? En savoir plus',
            'overlay.servesTime': 'Pour %servings% · %time% min', 'overlay.ingredients': 'Ingrédients', 'overlay.steps': 'Étapes', 'overlay.goDeeper': 'Aller plus loin',
            'overlay.sharpenEyeFirst': 'Affûte ton œil d\'abord', 'overlay.exploreMore': 'Explorer plus', 'overlay.playsHereLumen': 'Se lit directement ici, dans Lumen.', 'overlay.openOnYoutube': 'Ouvrir sur YouTube',
            'overlay.testsPassed': '%passed%/%total% tests réussis', 'overlay.errorPrefix': 'Erreur :', 'overlay.expectedSuffix': '(attendu : %expected%)', 'overlay.moreCount': '+%n% de plus', 'overlay.goToStep': 'Aller à %step%',
            'overlay.moodNote.energized': "Choisi pour une humeur énergique — quelque chose avec de l'élan.", 'overlay.moodNote.calm': 'Choisi pour une humeur calme — rien d\'urgent, reste juste avec ça.',
            'overlay.moodNote.tired': 'Choisi pour une humeur fatiguée — court et stable, rien à forcer.', 'overlay.moodNote.stressed': 'Choisi pour une humeur stressée — petit et apaisant, pas une chose de plus à gérer.',
            'overlay.moodNote.creative': "Choisi pour une humeur créative — de quoi allumer une idée.",
            'preview.langExample': 'ex. « %word% » — %translation%', 'preview.livePalette': 'Une palette de 5 couleurs en direct, générée pour toi', 'preview.writeChecked': 'Écris %fn%() — vérifié instantanément avec de vrais tests',
            'preview.playsHereOnPage': 'Se lit directement ici, sur cette page', 'preview.ingredientsSteps': '%ing% ingrédients · %steps% étapes',
            'feedback.hierarchy': 'Hiérarchie visuelle', 'feedback.contrast': 'Contraste (couleur ou taille)', 'feedback.spacing': 'Espace blanc / respiration', 'feedback.alignment': 'Alignement / grille', 'feedback.restraint': 'Sobriété des couleurs et polices (2–3 max)',
            'feedback.scoreLine': '<b>%n%/5</b> principes clés apparaissent dans ta description.', 'feedback.worthChecking': 'À vérifier avant de considérer que c\'est fini :',
            'feedback.allCovered': "Tu as couvert la liste de base — maintenant éloigne-toi 10 minutes et regarde à nouveau avec un œil neuf. C'est souvent là que les vrais problèmes apparaissent."
        }
    };

    let currentLang = 'en';
    // %key% placeholder substitution, e.g. t('path.swapTooltip', {goal: 'Reading'})
    function t(key, vars) {
        let s = (TRANSLATIONS[currentLang] && TRANSLATIONS[currentLang][key]) || TRANSLATIONS.en[key] || key;
        if (vars) Object.keys(vars).forEach(k => { s = s.split('%' + k + '%').join(vars[k]); });
        return s;
    }

    // 'language' is always in the sequence for dot-counting/back-nav purposes, but the
    // subject → style handoff (see SUBJECT SCREEN below) only actually routes through the
    // language screen when the picked subject is 'languages' — every other subject skips
    // straight from subject to style, same as before this step existed.
    const ONBOARD_SCREENS = ['goals', 'time', 'subject', 'language', 'style', 'mood', 'path', 'completion'];
    // Shown by default — kept short on purpose. AVATAR_CHOICES_MORE is revealed on demand via
    // the "+N more" button so the picker doesn't open already-cluttered.
    const AVATAR_CHOICES = ['🌸', '🦋', '🌊', '🔥', '🌙', '⭐', '🍃', '🎯'];
    const AVATAR_CHOICES_MORE = [
        '🌻', '🌼', '🌺', '🌷', '🌹', '🍀', '🌵', '🌲', '🌈', '☀️', '⛅', '❄️', '⚡', '🌍', '🪐', '✨',
        '💫', '🔮', '🐢', '🐝', '🦉', '🦊', '🐬', '🐳', '🦅', '🐉', '🦄', '🐨', '🦁', '🐯', '🐼', '🐧',
        '🍁', '🍄', '🍉', '🍇', '🥑', '🍯', '☕', '🎨', '🎵', '📚', '💎', '🏔️', '🌋', '🧭', '🕊️', '🐚'
    ];

    /* =========================================================
       2. REAL CONTENT LIBRARY
       Every entry below is genuinely specific: an actual short
       passage, an actual recipe, an actual runnable coding
       challenge, an actual design brief, an actual working link.
    ========================================================= */

    // ---- 2.1 Reading: original short passages (safe to reproduce in full) + real free-book links
    // Each passage is tagged with the moods it actually fits, so today's mood pick changes
    // which real passage shows up — not just how many activities you get.
    const READING_PASSAGES = [
        { title: "On Starting Before You're Ready", moods: ['energized', 'creative'], body: "Most people wait for a version of themselves that feels prepared. That version doesn't arrive by waiting — it arrives by doing the unprepared version of the thing, badly, a few times. The gap between 'I want to write' and 'I am a writer' is not talent. It's the pile of bad first drafts nobody else ever sees. Whatever you're circling today, the fastest way through is the unimpressive first attempt." },
        { title: "The Weight of Small Repetitions", moods: ['tired', 'stressed', 'calm'], body: "A single rep doesn't build a muscle. A single page doesn't finish a book. A single kind word doesn't repair a friendship. Almost nothing that matters is built in one motion — it's built in the boring, repeated ones that don't feel like progress while you're doing them. If today's version feels too small to count, that's usually a sign it's exactly the size that compounds." },
        { title: "Attention Is the Currency", moods: ['calm', 'stressed'], body: "Every platform designed after 2010 is optimized for one resource: your attention, extracted in small, renewable increments. Nothing about that design is accidental — the infinite scroll has no bottom because a bottom would give you a moment to leave. The counter-move isn't willpower. It's building things, like this page, that are designed to end." },
        { title: "On Rivers and Rooms", moods: ['calm', 'tired'], body: "A river doesn't decide to reach the sea; it just keeps finding the lowest point in front of it. Growth works the same way — you rarely see the whole shape of where you're headed. You just take the next small, obviously-right step in front of you, today, and trust that a hundred of those steps looks like a river from far enough away." },
        { title: "The Two-Minute Rule", moods: ['tired', 'stressed'], body: "Almost any habit can be shrunk down to under two minutes: 'read before bed' becomes 'read one page.' 'Exercise' becomes 'put on your shoes.' This isn't a trick to fool yourself — it's a recognition that the hardest part of most habits is the decision to start, not the doing. Make the start small enough that saying no to it feels stranger than saying yes." },
        { title: "The Room You Haven't Opened Yet", moods: ['creative', 'energized'], body: "Every idea you've ever had was standing next to ten quieter ones you didn't notice, because you stopped looking as soon as the first one arrived. The best creative move isn't finding an idea — it's staying in the room for three more minutes after you already have one, and writing down whatever shows up next, even if it looks worse on paper than the first." },
        { title: "Move Like You Mean It", moods: ['energized'], body: "There's a specific kind of day where the energy shows up before you've earned it — and the temptation is to save it for later, for when it's more convenient. Don't. Momentum is perishable. Whatever you were putting off until you 'felt ready' — today is the version of ready you were waiting for. Spend it now, on the thing that actually matters." }
    ];
    const READING_PASSAGES_AR = [
        { title: "عن البدء قبل أن تكون جاهزًا", moods: ['energized', 'creative'], body: "معظم الناس ينتظرون نسخة من أنفسهم تشعر بالاستعداد. تلك النسخة لا تصل بالانتظار — بل تصل بفعل النسخة غير المستعدة من الأمر، بشكل سيئ، عدة مرات. الفجوة بين «أريد أن أكتب» و«أنا كاتب» ليست موهبة. إنها كومة المسودات الأولى الرديئة التي لا يراها أحد آخر أبدًا. أيًا كان ما تدور حوله اليوم، أسرع طريق للعبور هو المحاولة الأولى غير المبهرة." },
        { title: "ثقل التكرارات الصغيرة", moods: ['tired', 'stressed', 'calm'], body: "تكرار واحد لا يبني عضلة. صفحة واحدة لا تُنهي كتابًا. كلمة لطيفة واحدة لا تُصلح صداقة. لا شيء تقريبًا مما يهم يُبنى بحركة واحدة — بل يُبنى بالحركات المملة والمتكررة التي لا تشعر أنها تقدّم وأنت تفعلها. إن كانت نسخة اليوم تبدو صغيرة جدًا لتُحتسب، فهذه عادةً علامة على أنها بالضبط الحجم الذي يتراكم." },
        { title: "الانتباه هو العملة", moods: ['calm', 'stressed'], body: "كل منصة صُممت بعد عام 2010 مُحسَّنة لمورد واحد: انتباهك، يُستخرج على دفعات صغيرة ومتجددة. لا شيء في هذا التصميم عرضي — التمرير اللانهائي ليس له قاع لأن القاع سيمنحك لحظة للمغادرة. الحركة المضادة ليست قوة الإرادة. إنها بناء أشياء، كهذه الصفحة، مصمَّمة لتنتهي." },
        { title: "عن الأنهار والغرف", moods: ['calm', 'tired'], body: "النهر لا يقرر الوصول إلى البحر؛ بل يستمر فقط في إيجاد أدنى نقطة أمامه. النمو يعمل بالطريقة نفسها — نادرًا ما ترى الشكل الكامل لوجهتك. أنت فقط تخطو الخطوة الصغيرة الصحيحة التالية أمامك، اليوم، وتثق أن مئة من هذه الخطوات تبدو كنهر من مسافة كافية." },
        { title: "قاعدة الدقيقتين", moods: ['tired', 'stressed'], body: "يمكن تصغير أي عادة تقريبًا إلى أقل من دقيقتين: «اقرأ قبل النوم» تصبح «اقرأ صفحة واحدة». «مارس الرياضة» تصبح «البس حذاءك». هذه ليست حيلة لخداع نفسك — إنها إدراك أن أصعب جزء في معظم العادات هو قرار البدء، وليس الفعل نفسه. اجعل البداية صغيرة بما يكفي بحيث يبدو رفضها أغرب من قبولها." },
        { title: "الغرفة التي لم تفتحها بعد", moods: ['creative', 'energized'], body: "كل فكرة خطرت لك يومًا كانت واقفة بجانب عشر أفكار أهدأ لم تلاحظها، لأنك توقفت عن البحث بمجرد وصول الأولى. أفضل خطوة إبداعية ليست إيجاد فكرة — بل البقاء في الغرفة ثلاث دقائق إضافية بعد أن تكون قد حصلت على واحدة بالفعل، وتدوين أي شيء يظهر بعدها، حتى لو بدا أسوأ على الورق من الأولى." },
        { title: "تحرّك وكأنك تعنيه", moods: ['energized'], body: "هناك نوع معين من الأيام تظهر فيه الطاقة قبل أن تكون قد استحققتها — والإغراء هو ادّخارها لوقت لاحق، أكثر ملاءمة. لا تفعل. الزخم قابل للتلف. أيًا كان ما كنت تؤجله حتى «تشعر بالاستعداد» — اليوم هو نسخة الاستعداد التي كنت تنتظرها. أنفقها الآن، على الأمر الذي يهم فعلًا." }
    ];
    const READING_PASSAGES_ES = [
        { title: "Sobre empezar antes de estar listo", moods: ['energized', 'creative'], body: "La mayoría de la gente espera una versión de sí misma que se sienta preparada. Esa versión no llega esperando — llega haciendo la versión no preparada de la cosa, mal, unas cuantas veces. La distancia entre 'quiero escribir' y 'soy escritor' no es talento. Es el montón de primeros borradores malos que nadie más ve jamás. Sea lo que sea que estés rondando hoy, el camino más rápido es el primer intento poco impresionante." },
        { title: "El peso de las pequeñas repeticiones", moods: ['tired', 'stressed', 'calm'], body: "Una sola repetición no construye un músculo. Una sola página no termina un libro. Una sola palabra amable no repara una amistad. Casi nada de lo que importa se construye de una vez — se construye con los movimientos aburridos y repetidos que no se sienten como progreso mientras los haces. Si la versión de hoy parece demasiado pequeña para contar, suele ser señal de que es justo del tamaño que se acumula." },
        { title: "La atención es la moneda", moods: ['calm', 'stressed'], body: "Cada plataforma diseñada después de 2010 está optimizada para un recurso: tu atención, extraída en pequeños incrementos renovables. Nada en ese diseño es accidental — el scroll infinito no tiene fondo porque un fondo te daría un momento para irte. El contramovimiento no es fuerza de voluntad. Es construir cosas, como esta página, diseñadas para terminar." },
        { title: "Sobre ríos y habitaciones", moods: ['calm', 'tired'], body: "Un río no decide llegar al mar; simplemente sigue encontrando el punto más bajo frente a él. El crecimiento funciona igual — rara vez ves la forma completa de hacia dónde vas. Solo das el siguiente paso pequeño y obviamente correcto frente a ti, hoy, y confías en que cien de esos pasos se ven como un río desde suficiente distancia." },
        { title: "La regla de los dos minutos", moods: ['tired', 'stressed'], body: "Casi cualquier hábito se puede reducir a menos de dos minutos: 'leer antes de dormir' se convierte en 'leer una página'. 'Hacer ejercicio' se convierte en 'ponerte los zapatos'. Esto no es un truco para engañarte — es reconocer que la parte más difícil de la mayoría de los hábitos es la decisión de empezar, no el hacerlo. Haz que el inicio sea tan pequeño que decir que no se sienta más raro que decir que sí." },
        { title: "La habitación que aún no has abierto", moods: ['creative', 'energized'], body: "Cada idea que has tenido estaba junto a otras diez más silenciosas que no notaste, porque dejaste de buscar en cuanto llegó la primera. El mejor movimiento creativo no es encontrar una idea — es quedarte en la habitación tres minutos más después de ya tener una, y anotar lo que sea que aparezca después, aunque se vea peor en el papel que la primera." },
        { title: "Muévete como si lo sintieras de verdad", moods: ['energized'], body: "Hay un tipo específico de día en que la energía aparece antes de que la hayas ganado — y la tentación es guardarla para después, para cuando sea más conveniente. No lo hagas. El impulso es perecedero. Lo que sea que estabas posponiendo hasta 'sentirte listo' — hoy es la versión de listo que estabas esperando. Gástala ahora, en lo que realmente importa." }
    ];
    const READING_PASSAGES_FR = [
        { title: "Commencer avant d'être prêt", moods: ['energized', 'creative'], body: "La plupart des gens attendent une version d'eux-mêmes qui se sente prête. Cette version n'arrive pas en attendant — elle arrive en faisant la version non préparée de la chose, mal, quelques fois. L'écart entre « je veux écrire » et « je suis écrivain » n'est pas du talent. C'est la pile de mauvais premiers brouillons que personne d'autre ne voit jamais. Quoi que tu tournes autour aujourd'hui, le chemin le plus rapide est le premier essai peu impressionnant." },
        { title: "Le poids des petites répétitions", moods: ['tired', 'stressed', 'calm'], body: "Une seule répétition ne construit pas un muscle. Une seule page ne termine pas un livre. Un seul mot gentil ne répare pas une amitié. Presque rien de ce qui compte ne se construit en un seul geste — ça se construit dans les gestes ennuyeux et répétés qui ne ressemblent pas à du progrès pendant qu'on les fait. Si la version d'aujourd'hui semble trop petite pour compter, c'est souvent le signe qu'elle a exactement la taille qui s'accumule." },
        { title: "L'attention est la monnaie", moods: ['calm', 'stressed'], body: "Chaque plateforme conçue après 2010 est optimisée pour une seule ressource : ton attention, extraite par petits incréments renouvelables. Rien dans ce design n'est accidentel — le défilement infini n'a pas de fond parce qu'un fond te donnerait un moment pour partir. Le contre-mouvement, ce n'est pas la volonté. C'est construire des choses, comme cette page, conçues pour se terminer." },
        { title: "Des rivières et des pièces", moods: ['calm', 'tired'], body: "Une rivière ne décide pas d'atteindre la mer ; elle continue simplement à trouver le point le plus bas devant elle. La croissance fonctionne pareil — tu vois rarement la forme entière de là où tu vas. Tu fais juste le prochain petit pas, évidemment juste, devant toi, aujourd'hui, en faisant confiance au fait que cent de ces pas ressemblent à une rivière vue de assez loin." },
        { title: "La règle des deux minutes", moods: ['tired', 'stressed'], body: "Presque toute habitude peut être réduite à moins de deux minutes : « lire avant de dormir » devient « lire une page ». « Faire du sport » devient « mettre ses chaussures ». Ce n'est pas une astuce pour te tromper toi-même — c'est reconnaître que la partie la plus difficile de la plupart des habitudes est la décision de commencer, pas le fait de le faire. Rends le début assez petit pour que dire non semble plus étrange que dire oui." },
        { title: "La pièce que tu n'as pas encore ouverte", moods: ['creative', 'energized'], body: "Chaque idée que tu as jamais eue se tenait à côté de dix autres plus discrètes que tu n'as pas remarquées, parce que tu as arrêté de chercher dès que la première est arrivée. Le meilleur geste créatif n'est pas de trouver une idée — c'est de rester dans la pièce trois minutes de plus après en avoir déjà une, et d'écrire ce qui apparaît ensuite, même si ça a l'air pire sur papier que la première." },
        { title: "Bouge comme si tu le pensais vraiment", moods: ['energized'], body: "Il y a un type de journée particulier où l'énergie arrive avant que tu ne l'aies méritée — et la tentation est de la garder pour plus tard, pour quand ce sera plus pratique. Ne le fais pas. L'élan est périssable. Tout ce que tu remettais à plus tard jusqu'à te « sentir prêt » — aujourd'hui est la version du prêt que tu attendais. Dépense-la maintenant, sur ce qui compte vraiment." }
    ];
    const READING_FURTHER = [
        { label: "Read free — public-domain classics", url: "https://www.gutenberg.org/" },
        { label: "Read free — beautifully formatted ebooks", url: "https://standardebooks.org/" },
        { label: "Read free — short story of the day", url: "https://www.themarginalian.org/" },
        { label: "Buy a book — support an indie bookstore", url: "https://bookshop.org/" }
    ];
    const READING_FURTHER_AR = [
        { label: "اقرأ مجانًا — كلاسيكيات في المجال العام", url: "https://www.gutenberg.org/" },
        { label: "اقرأ مجانًا — كتب إلكترونية بتنسيق أنيق", url: "https://standardebooks.org/" },
        { label: "اقرأ مجانًا — قصة قصيرة كل يوم", url: "https://www.themarginalian.org/" },
        { label: "اشترِ كتابًا — وادعم مكتبة مستقلة", url: "https://bookshop.org/" }
    ];
    const READING_FURTHER_ES = [
        { label: "Lee gratis — clásicos de dominio público", url: "https://www.gutenberg.org/" },
        { label: "Lee gratis — ebooks bellamente maquetados", url: "https://standardebooks.org/" },
        { label: "Lee gratis — el relato corto del día", url: "https://www.themarginalian.org/" },
        { label: "Compra un libro — apoya una librería independiente", url: "https://bookshop.org/" }
    ];
    const READING_FURTHER_FR = [
        { label: "Lis gratuitement — classiques du domaine public", url: "https://www.gutenberg.org/" },
        { label: "Lis gratuitement — ebooks joliment mis en page", url: "https://standardebooks.org/" },
        { label: "Lis gratuitement — la nouvelle du jour", url: "https://www.themarginalian.org/" },
        { label: "Achète un livre — soutiens une librairie indépendante", url: "https://bookshop.org/" }
    ];

    // ---- 2.2 Languages: real vocab sets
    const LANGUAGE_SETS = [
        {
            language: "Spanish", words: [
                { word: "madrugar", translation: "to wake up early", example: "Prefiero madrugar los lunes." },
                { word: "sobremesa", translation: "time spent chatting at the table after a meal", example: "Nos quedamos de sobremesa una hora." },
                { word: "estrenar", translation: "to use/wear something for the first time", example: "Voy a estrenar estos zapatos hoy." },
                { word: "tocayo/a", translation: "someone who shares your name", example: "Mi tocayo también se llama Sam." },
                { word: "desvelarse", translation: "to stay up very late / lose sleep", example: "Me desvelé estudiando anoche." }
            ]
        },
        {
            language: "Japanese", words: [
                { word: "木漏れ日 (komorebi)", translation: "sunlight filtering through leaves", example: "公園で木漏れ日を見た。" },
                { word: "頑張って (ganbatte)", translation: "do your best / good luck", example: "試験、頑張って！" },
                { word: "もったいない (mottainai)", translation: "what a waste", example: "食べ物を捨てるのはもったいない。" },
                { word: "お疲れ様 (otsukaresama)", translation: "thanks for your hard work", example: "今日もお疲れ様でした。" },
                { word: "懐かしい (natsukashii)", translation: "nostalgic, fondly remembered", example: "この歌は懐かしい。" }
            ]
        },
        {
            language: "French", words: [
                { word: "flâner", translation: "to stroll aimlessly, without a destination", example: "On a flâné dans le quartier." },
                { word: "dépaysement", translation: "the disorientation of being somewhere unfamiliar", example: "Le dépaysement du voyage m'a fait du bien." },
                { word: "retrouvailles", translation: "the joy of reuniting after time apart", example: "Nos retrouvailles étaient émouvantes." },
                { word: "ras-le-bol", translation: "being fed up / at your limit", example: "J'en ai ras-le-bol de ce bruit." },
                { word: "chez", translation: "at the home/place of", example: "On se retrouve chez moi ce soir." }
            ]
        },
        {
            language: "German", words: [
                { word: "Feierabend", translation: "the feeling of freedom once the workday ends", example: "Endlich Feierabend!" },
                { word: "Fernweh", translation: "an ache to travel, longing for far-off places", example: "Ich habe Fernweh." },
                { word: "Doch", translation: "a contradicting 'yes' to a negative question", example: "Hast du kein Geld? — Doch!" },
                { word: "Sturmfrei", translation: "having the place to yourself", example: "Heute ist die Wohnung sturmfrei." },
                { word: "Torschlusspanik", translation: "the panic of time running out on an opportunity", example: "Sie hat Torschlusspanik wegen der Frist." }
            ]
        }
    ];
    // Only the `translation` (English gloss) is localized — `word` and `example` stay in the
    // language actually being taught, and `language` stays an unchanged lookup key.
    const LANGUAGE_SETS_AR = [
        {
            language: "Spanish", words: [
                { word: "madrugar", translation: "الاستيقاظ باكرًا", example: "Prefiero madrugar los lunes." },
                { word: "sobremesa", translation: "الوقت الذي يُقضى في الحديث على الطاولة بعد الوجبة", example: "Nos quedamos de sobremesa una hora." },
                { word: "estrenar", translation: "استخدام أو ارتداء شيء لأول مرة", example: "Voy a estrenar estos zapatos hoy." },
                { word: "tocayo/a", translation: "شخص يحمل اسمك نفسه", example: "Mi tocayo también se llama Sam." },
                { word: "desvelarse", translation: "السهر لوقت متأخر جدًا / فقدان النوم", example: "Me desvelé estudiando anoche." }
            ]
        },
        {
            language: "Japanese", words: [
                { word: "木漏れ日 (komorebi)", translation: "ضوء الشمس المتسلل عبر أوراق الشجر", example: "公園で木漏れ日を見た。" },
                { word: "頑張って (ganbatte)", translation: "ابذل قصارى جهدك / بالتوفيق", example: "試験、頑張って！" },
                { word: "もったいない (mottainai)", translation: "يا للهدر", example: "食べ物を捨てるのはもったいない。" },
                { word: "お疲れ様 (otsukaresama)", translation: "شكرًا على مجهودك", example: "今日もお疲れ様でした。" },
                { word: "懐かしい (natsukashii)", translation: "حنين، يُتذكَّر بمحبة", example: "この歌は懐かしい。" }
            ]
        },
        {
            language: "French", words: [
                { word: "flâner", translation: "التجول بلا هدف، دون وجهة", example: "On a flâné dans le quartier." },
                { word: "dépaysement", translation: "شعور الحيرة عند التواجد في مكان غير مألوف", example: "Le dépaysement du voyage m'a fait du bien." },
                { word: "retrouvailles", translation: "فرحة لمّ الشمل بعد فترة فراق", example: "Nos retrouvailles étaient émouvantes." },
                { word: "ras-le-bol", translation: "الشعور بالسأم / بلوغ حد الاحتمال", example: "J'en ai ras-le-bol de ce bruit." },
                { word: "chez", translation: "في بيت/مكان شخص ما", example: "On se retrouve chez moi ce soir." }
            ]
        },
        {
            language: "German", words: [
                { word: "Feierabend", translation: "شعور الحرية بمجرد انتهاء يوم العمل", example: "Endlich Feierabend!" },
                { word: "Fernweh", translation: "شوق للسفر، حنين لأماكن بعيدة", example: "Ich habe Fernweh." },
                { word: "Doch", translation: "«بلى» تناقض سؤالًا منفيًا", example: "Hast du kein Geld? — Doch!" },
                { word: "Sturmfrei", translation: "أن يكون المكان لك وحدك", example: "Heute ist die Wohnung sturmfrei." },
                { word: "Torschlusspanik", translation: "الذعر من فوات فرصة مع نفاد الوقت", example: "Sie hat Torschlusspanik wegen der Frist." }
            ]
        }
    ];
    const LANGUAGE_SETS_ES = [
        {
            language: "Spanish", words: [
                { word: "madrugar", translation: "levantarse muy temprano", example: "Prefiero madrugar los lunes." },
                { word: "sobremesa", translation: "el rato de charla en la mesa después de comer", example: "Nos quedamos de sobremesa una hora." },
                { word: "estrenar", translation: "usar algo por primera vez", example: "Voy a estrenar estos zapatos hoy." },
                { word: "tocayo/a", translation: "alguien que comparte tu nombre", example: "Mi tocayo también se llama Sam." },
                { word: "desvelarse", translation: "quedarse despierto hasta muy tarde / perder el sueño", example: "Me desvelé estudiando anoche." }
            ]
        },
        {
            language: "Japanese", words: [
                { word: "木漏れ日 (komorebi)", translation: "la luz del sol filtrándose entre las hojas", example: "公園で木漏れ日を見た。" },
                { word: "頑張って (ganbatte)", translation: "da lo mejor de ti / suerte", example: "試験、頑張って！" },
                { word: "もったいない (mottainai)", translation: "qué desperdicio", example: "食べ物を捨てるのはもったいない。" },
                { word: "お疲れ様 (otsukaresama)", translation: "gracias por tu esfuerzo", example: "今日もお疲れ様でした。" },
                { word: "懐かしい (natsukashii)", translation: "nostálgico, recordado con cariño", example: "この歌は懐かしい。" }
            ]
        },
        {
            language: "French", words: [
                { word: "flâner", translation: "pasear sin rumbo, sin destino", example: "On a flâné dans le quartier." },
                { word: "dépaysement", translation: "la desorientación de estar en un lugar desconocido", example: "Le dépaysement du voyage m'a fait du bien." },
                { word: "retrouvailles", translation: "la alegría de reencontrarse tras un tiempo separados", example: "Nos retrouvailles étaient émouvantes." },
                { word: "ras-le-bol", translation: "estar harto / al límite", example: "J'en ai ras-le-bol de ce bruit." },
                { word: "chez", translation: "en casa/donde alguien", example: "On se retrouve chez moi ce soir." }
            ]
        },
        {
            language: "German", words: [
                { word: "Feierabend", translation: "la sensación de libertad al terminar la jornada laboral", example: "Endlich Feierabend!" },
                { word: "Fernweh", translation: "las ganas de viajar, añoranza de lugares lejanos", example: "Ich habe Fernweh." },
                { word: "Doch", translation: "un 'sí' que contradice una pregunta negativa", example: "Hast du kein Geld? — Doch!" },
                { word: "Sturmfrei", translation: "tener el lugar solo para ti", example: "Heute ist die Wohnung sturmfrei." },
                { word: "Torschlusspanik", translation: "el pánico de que se acabe el tiempo para una oportunidad", example: "Sie hat Torschlusspanik wegen der Frist." }
            ]
        }
    ];
    const LANGUAGE_SETS_FR = [
        {
            language: "Spanish", words: [
                { word: "madrugar", translation: "se lever très tôt", example: "Prefiero madrugar los lunes." },
                { word: "sobremesa", translation: "le moment passé à discuter à table après le repas", example: "Nos quedamos de sobremesa una hora." },
                { word: "estrenar", translation: "utiliser ou porter quelque chose pour la première fois", example: "Voy a estrenar estos zapatos hoy." },
                { word: "tocayo/a", translation: "quelqu'un qui porte le même prénom que toi", example: "Mi tocayo también se llama Sam." },
                { word: "desvelarse", translation: "veiller très tard / perdre le sommeil", example: "Me desvelé estudiando anoche." }
            ]
        },
        {
            language: "Japanese", words: [
                { word: "木漏れ日 (komorebi)", translation: "la lumière du soleil filtrant à travers les feuilles", example: "公園で木漏れ日を見た。" },
                { word: "頑張って (ganbatte)", translation: "fais de ton mieux / bonne chance", example: "試験、頑張って！" },
                { word: "もったいない (mottainai)", translation: "quel gâchis", example: "食べ物を捨てるのはもったいない。" },
                { word: "お疲れ様 (otsukaresama)", translation: "merci pour ton travail", example: "今日もお疲れ様でした。" },
                { word: "懐かしい (natsukashii)", translation: "nostalgique, un souvenir tendre", example: "この歌は懐かしい。" }
            ]
        },
        {
            language: "French", words: [
                { word: "flâner", translation: "se promener sans but, sans destination", example: "On a flâné dans le quartier." },
                { word: "dépaysement", translation: "la désorientation d'être dans un lieu inconnu", example: "Le dépaysement du voyage m'a fait du bien." },
                { word: "retrouvailles", translation: "la joie de se retrouver après une séparation", example: "Nos retrouvailles étaient émouvantes." },
                { word: "ras-le-bol", translation: "en avoir assez / être à bout", example: "J'en ai ras-le-bol de ce bruit." },
                { word: "chez", translation: "au domicile/à l'endroit de quelqu'un", example: "On se retrouve chez moi ce soir." }
            ]
        },
        {
            language: "German", words: [
                { word: "Feierabend", translation: "le sentiment de liberté une fois la journée de travail finie", example: "Endlich Feierabend!" },
                { word: "Fernweh", translation: "l'envie de voyager, la nostalgie des lieux lointains", example: "Ich habe Fernweh." },
                { word: "Doch", translation: "un « si » qui contredit une question négative", example: "Hast du kein Geld? — Doch!" },
                { word: "Sturmfrei", translation: "avoir les lieux pour soi tout seul", example: "Heute ist die Wohnung sturmfrei." },
                { word: "Torschlusspanik", translation: "la panique de voir une opportunité filer faute de temps", example: "Sie hat Torschlusspanik wegen der Frist." }
            ]
        }
    ];

    // ---- 2.3 Design: real practical briefs + palette generator seeds
    const DESIGN_BRIEFS = [
        { prompt: "Design a minimal poster announcing a one-night jazz show. Use no more than 2 fonts and 3 colors.", constraint: "Constraint: the venue name must be the largest element on the page." },
        { prompt: "Redesign a boring 'SALE 20% OFF' banner into something you'd actually stop scrolling for.", constraint: "Constraint: keep every original word — only change layout, type, and color." },
        { prompt: "Design a simple logo mark (not a wordmark) for a fictional coffee roastery called Northbound.", constraint: "Constraint: it has to work as a single color at 24px." },
        { prompt: "Lay out a two-color business card for a freelance illustrator. Name, email, one line of tagline.", constraint: "Constraint: no more than 12 words total on the card." },
        { prompt: "Design an Instagram carousel cover slide (1080×1080) for '5 tips to read more books'.", constraint: "Constraint: the number '5' should be the visual anchor of the composition." }
    ];
    const DESIGN_BRIEFS_AR = [
        { prompt: "صمّم ملصقًا بسيطًا للإعلان عن حفلة جاز لليلة واحدة. استخدم خطين وثلاثة ألوان كحد أقصى.", constraint: "الشرط: يجب أن يكون اسم المكان أكبر عنصر في الصفحة." },
        { prompt: "أعد تصميم بانر مملّ 'خصم 20%' ليصبح شيئًا تتوقف فعلًا عند رؤيته أثناء التصفح.", constraint: "الشرط: احتفظ بكل كلمة أصلية — غيّر فقط التخطيط والخط واللون." },
        { prompt: "صمّم شعارًا رمزيًا بسيطًا (وليس اسمًا كتابيًا) لمحمصة بن خيالية اسمها Northbound.", constraint: "الشرط: يجب أن يعمل بلون واحد بحجم 24px." },
        { prompt: "صمّم بطاقة عمل بلونين لرسام مستقل. الاسم، البريد الإلكتروني، وسطر واحد كشعار.", constraint: "الشرط: 12 كلمة كحد أقصى على البطاقة بالكامل." },
        { prompt: "صمّم شريحة غلاف لمنشور Instagram دوّار (1080×1080) بعنوان '5 نصائح لقراءة المزيد من الكتب'.", constraint: "الشرط: يجب أن يكون الرقم '5' هو المرتكز البصري للتكوين." }
    ];
    const DESIGN_BRIEFS_ES = [
        { prompt: "Diseña un póster minimalista anunciando un concierto de jazz de una sola noche. Usa como máximo 2 tipografías y 3 colores.", constraint: "Restricción: el nombre del local debe ser el elemento más grande de la página." },
        { prompt: "Rediseña un aburrido banner de 'REBAJAS 20% DTO' en algo por lo que de verdad dejarías de hacer scroll.", constraint: "Restricción: conserva cada palabra original — cambia solo el layout, la tipografía y el color." },
        { prompt: "Diseña un isotipo simple (no un logotipo textual) para una tostadora de café ficticia llamada Northbound.", constraint: "Restricción: tiene que funcionar en un solo color a 24px." },
        { prompt: "Maqueta una tarjeta de presentación a dos colores para un ilustrador freelance. Nombre, correo, una línea de lema.", constraint: "Restricción: no más de 12 palabras en total en la tarjeta." },
        { prompt: "Diseña la portada de un carrusel de Instagram (1080×1080) para '5 tips para leer más libros'.", constraint: "Restricción: el número '5' debe ser el ancla visual de la composición." }
    ];
    const DESIGN_BRIEFS_FR = [
        { prompt: "Conçois une affiche minimaliste annonçant un concert de jazz d'un soir. Utilise au maximum 2 polices et 3 couleurs.", constraint: "Contrainte : le nom du lieu doit être l'élément le plus grand de la page." },
        { prompt: "Redessine une bannière ennuyeuse 'SOLDES -20%' en quelque chose qui arrêterait vraiment ton scroll.", constraint: "Contrainte : garde chaque mot d'origine — change seulement la mise en page, la typo et la couleur." },
        { prompt: "Conçois un simple pictogramme de logo (pas un logotype) pour une torréfaction de café fictive appelée Northbound.", constraint: "Contrainte : il doit fonctionner en une seule couleur à 24px." },
        { prompt: "Mets en page une carte de visite à deux couleurs pour un illustrateur freelance. Nom, e-mail, une ligne de slogan.", constraint: "Contrainte : pas plus de 12 mots au total sur la carte." },
        { prompt: "Conçois la couverture d'un carrousel Instagram (1080×1080) pour '5 astuces pour lire plus de livres'.", constraint: "Contrainte : le chiffre '5' doit être l'ancre visuelle de la composition." }
    ];
    const DESIGN_TOOLS = [
        { label: "Free templates on Canva", url: "https://www.canva.com/templates/" },
        { label: "Real logos & brand work on Behance", url: "https://www.behance.net/search/projects?search=logo%20design" },
        { label: "Color palette generator", url: "https://coolors.co/" },
        { label: "Free fonts", url: "https://fonts.google.com/" }
    ];
    const DESIGN_TOOLS_AR = [
        { label: "قوالب مجانية على Canva", url: "https://www.canva.com/templates/" },
        { label: "شعارات وأعمال هوية حقيقية على Behance", url: "https://www.behance.net/search/projects?search=logo%20design" },
        { label: "مولّد لوحة ألوان", url: "https://coolors.co/" },
        { label: "خطوط مجانية", url: "https://fonts.google.com/" }
    ];
    const DESIGN_TOOLS_ES = [
        { label: "Plantillas gratis en Canva", url: "https://www.canva.com/templates/" },
        { label: "Logos y trabajos de marca reales en Behance", url: "https://www.behance.net/search/projects?search=logo%20design" },
        { label: "Generador de paletas de color", url: "https://coolors.co/" },
        { label: "Fuentes gratuitas", url: "https://fonts.google.com/" }
    ];
    const DESIGN_TOOLS_FR = [
        { label: "Modèles gratuits sur Canva", url: "https://www.canva.com/templates/" },
        { label: "Vrais logos et travaux de marque sur Behance", url: "https://www.behance.net/search/projects?search=logo%20design" },
        { label: "Générateur de palette de couleurs", url: "https://coolors.co/" },
        { label: "Polices gratuites", url: "https://fonts.google.com/" }
    ];
    const DESIGN_READING = { title: "Design Is Decisions, Not Decoration", body: "The instinct when a design looks unfinished is to add more — another color, another flourish, a drop shadow. Almost every time, the fix is the opposite. Professional design is less about what you add and more about what you have the discipline to leave out: one typeface instead of three, one accent color instead of five. Constraint isn't a limit on creativity — for a beginner, it's usually the only thing standing between an idea and something that actually looks intentional." };
    const DESIGN_READING_AR = { title: "التصميم قرارات، لا زخرفة", body: "الغريزة عندما يبدو التصميم غير مكتمل هي إضافة المزيد — لون آخر، لمسة أخرى، ظل إسقاط. في كل مرة تقريبًا، الحل هو العكس. التصميم الاحترافي لا يتعلق بما تضيفه بقدر ما يتعلق بما لديك الانضباط لتركه: خط واحد بدلًا من ثلاثة، لون تمييز واحد بدلًا من خمسة. القيد ليس حدًا للإبداع — بالنسبة للمبتدئ، عادةً ما يكون الشيء الوحيد الفاصل بين فكرة وشيء يبدو مقصودًا فعلًا." };
    const DESIGN_READING_ES = { title: "El diseño son decisiones, no decoración", body: "El instinto cuando un diseño parece inacabado es añadir más — otro color, otro adorno, una sombra. Casi siempre, la solución es la contraria. El diseño profesional trata menos de lo que añades y más de lo que tienes la disciplina de dejar fuera: una sola tipografía en vez de tres, un solo color de acento en vez de cinco. La restricción no es un límite a la creatividad — para un principiante, suele ser lo único que separa una idea de algo que realmente se ve intencional." };
    const DESIGN_READING_FR = { title: "Le design, ce sont des décisions, pas de la décoration", body: "L'instinct quand un design semble inachevé, c'est d'en rajouter — une couleur de plus, une fioriture, une ombre portée. Presque à chaque fois, la solution est l'inverse. Le design professionnel, ce n'est pas tant ce que tu ajoutes que ce que tu as la discipline de laisser de côté : une seule police au lieu de trois, une seule couleur d'accent au lieu de cinq. La contrainte n'est pas une limite à la créativité — pour un débutant, c'est souvent la seule chose qui sépare une idée de quelque chose qui a vraiment l'air voulu." };
    function seededPalette(seedStr) {
        let h = 0;
        for (let i = 0; i < seedStr.length; i++) { h = (h * 31 + seedStr.charCodeAt(i)) >>> 0; }
        function rand() { h = (h * 1664525 + 1013904223) >>> 0; return h / 4294967296; }
        const baseHue = Math.floor(rand() * 360);
        const colors = [];
        const roles = ['Base', 'Accent', 'Neutral dark', 'Neutral light', 'Highlight'];
        for (let i = 0; i < 5; i++) {
            const hue = (baseHue + [0, 150, 200, 0, 40][i] + rand() * 20) % 360;
            const sat = i === 2 ? 8 + rand() * 8 : i === 3 ? 10 + rand() * 10 : 55 + rand() * 30;
            const light = i === 2 ? 14 + rand() * 8 : i === 3 ? 90 + rand() * 6 : 45 + rand() * 20;
            colors.push({ role: roles[i], hsl: `hsl(${Math.round(hue)} ${Math.round(sat)}% ${Math.round(light)}%)` });
        }
        return colors;
    }

    // ---- 2.4 Coding: real runnable challenges
    const CODING_CHALLENGES = [
        { title: "Reverse a string", fn: "reverseString", starter: "function reverseString(s) {\n  // return s, reversed\n\n}", tests: [["hello", "olleh"], ["Lumen", "nemuL"], ["", ""]] },
        { title: "Find the largest number in an array", fn: "largest", starter: "function largest(nums) {\n  // return the biggest number in nums\n\n}", tests: [[[1, 5, 2], 5], [[-3, -1, -9], -1], [[7], 7]] },
        { title: "Check if a number is prime", fn: "isPrime", starter: "function isPrime(n) {\n  // return true/false\n\n}", tests: [[7, true], [10, false], [2, true], [1, false]] },
        { title: "Count vowels in a string", fn: "countVowels", starter: "function countVowels(s) {\n  // return the number of vowels (a e i o u) in s\n\n}", tests: [["hello", 2], ["Lumen", 2], ["xyz", 0]] },
        { title: "FizzBuzz up to n (return an array)", fn: "fizzBuzz", starter: "function fizzBuzz(n) {\n  // return an array of length n:\n  // multiples of 3 -> 'Fizz', of 5 -> 'Buzz', of both -> 'FizzBuzz', else the number\n\n}", tests: [[5, ["1", "2", "Fizz", "4", "Buzz"]]] }
    ];
    // Only `title` is localized — `fn`/`starter`/`tests` are executable JS and must stay as-is.
    const CODING_CHALLENGES_AR = [
        { title: "اعكس سلسلة نصية" },
        { title: "أوجد أكبر رقم في مصفوفة" },
        { title: "تحقق مما إذا كان الرقم أوليًا" },
        { title: "عدّ حروف العلة في سلسلة نصية" },
        { title: "FizzBuzz حتى n (أعد مصفوفة)" }
    ];
    const CODING_CHALLENGES_ES = [
        { title: "Invertir una cadena de texto" },
        { title: "Encontrar el número más grande de un array" },
        { title: "Comprobar si un número es primo" },
        { title: "Contar las vocales de una cadena de texto" },
        { title: "FizzBuzz hasta n (devuelve un array)" }
    ];
    const CODING_CHALLENGES_FR = [
        { title: "Inverser une chaîne de caractères" },
        { title: "Trouver le plus grand nombre d'un tableau" },
        { title: "Vérifier si un nombre est premier" },
        { title: "Compter les voyelles d'une chaîne de caractères" },
        { title: "FizzBuzz jusqu'à n (renvoie un tableau)" }
    ];
    const CODING_LEARN = [
        { label: "Free interactive lessons — freeCodeCamp", url: "https://www.freecodecamp.org/" },
        { label: "The web reference — MDN Docs", url: "https://developer.mozilla.org/" },
        { label: "Practice problems — exercism.org", url: "https://exercism.org/" }
    ];
    const CODING_LEARN_AR = [
        { label: "دروس تفاعلية مجانية — freeCodeCamp", url: "https://www.freecodecamp.org/" },
        { label: "مرجع الويب — MDN Docs", url: "https://developer.mozilla.org/" },
        { label: "مسائل تدريبية — exercism.org", url: "https://exercism.org/" }
    ];
    const CODING_LEARN_ES = [
        { label: "Lecciones interactivas gratis — freeCodeCamp", url: "https://www.freecodecamp.org/" },
        { label: "La referencia web — MDN Docs", url: "https://developer.mozilla.org/" },
        { label: "Ejercicios de práctica — exercism.org", url: "https://exercism.org/" }
    ];
    const CODING_LEARN_FR = [
        { label: "Leçons interactives gratuites — freeCodeCamp", url: "https://www.freecodecamp.org/" },
        { label: "La référence du web — MDN Docs", url: "https://developer.mozilla.org/" },
        { label: "Exercices pratiques — exercism.org", url: "https://exercism.org/" }
    ];
    const CODING_READING = { title: "The Bug Is Never Where You're Looking", body: "Every developer eventually learns the same lesson the hard way: the bug is almost never in the line you're staring at. It's three functions upstream, in an assumption you made an hour ago and stopped questioning. That's why the best debugging tool isn't a clever trick — it's the discipline to stop guessing and start verifying, one assumption at a time, from the beginning. Print the value. Don't assume it's what you think it is. Half of programming is just refusing to trust yourself for five more minutes." };
    const CODING_READING_AR = { title: "الخطأ ليس أبدًا حيث تنظر", body: "كل مطوّر يتعلم في النهاية الدرس نفسه بالطريقة الصعبة: الخطأ لا يكون تقريبًا أبدًا في السطر الذي تحدّق فيه. إنه في ثلاث دوال قبل ذلك، في افتراض قمت به منذ ساعة وتوقفت عن التشكيك فيه. لهذا السبب أفضل أداة لتصحيح الأخطاء ليست حيلة ذكية — إنها الانضباط للتوقف عن التخمين والبدء في التحقق، افتراضًا واحدًا في كل مرة، من البداية. اطبع القيمة. لا تفترض أنها ما تظنه. نصف البرمجة هو فقط رفض الثقة بنفسك لخمس دقائق إضافية." };
    const CODING_READING_ES = { title: "El error nunca está donde estás mirando", body: "Todo desarrollador acaba aprendiendo la misma lección por las malas: el error casi nunca está en la línea que estás mirando fijamente. Está tres funciones más arriba, en una suposición que hiciste hace una hora y dejaste de cuestionar. Por eso la mejor herramienta de depuración no es un truco ingenioso — es la disciplina de dejar de adivinar y empezar a verificar, una suposición a la vez, desde el principio. Imprime el valor. No asumas que es lo que crees. La mitad de la programación es simplemente negarte a confiar en ti mismo cinco minutos más." };
    const CODING_READING_FR = { title: "Le bug n'est jamais là où tu regardes", body: "Tout développeur finit par apprendre la même leçon à la dure : le bug n'est presque jamais dans la ligne que tu fixes. Il est trois fonctions plus haut, dans une hypothèse que tu as faite il y a une heure et que tu as arrêté de remettre en question. C'est pourquoi le meilleur outil de débogage n'est pas une astuce maligne — c'est la discipline d'arrêter de deviner et de commencer à vérifier, une hypothèse à la fois, depuis le début. Affiche la valeur. Ne suppose pas qu'elle est ce que tu penses. La moitié de la programmation, c'est simplement refuser de te faire confiance cinq minutes de plus." };

    // ---- 2.5 Cooking: real original recipes, sized small
    const RECIPES = [
        {
            title: "5-Minute Garlic Chili Noodles", time: 15, servings: "1", ingredients: ["1 portion instant or dry noodles", "2 cloves garlic, minced", "1 tbsp soy sauce", "1 tsp chili flakes (or chili oil)", "1 tsp rice vinegar", "1/2 tsp sugar", "1 tbsp neutral oil", "Sliced scallion, to finish"],
            steps: ["Boil the noodles according to the package, then drain and set aside.", "While they cook, mix soy sauce, chili flakes, vinegar and sugar in a bowl — this is your sauce.", "Heat the oil in a small pan until just shimmering, then pour it straight over the minced garlic in a heatproof bowl. It should sizzle loudly.", "Add the noodles and sauce to the garlic-oil bowl and toss well.", "Top with scallion and eat immediately."]
        },
        {
            title: "One-Pan Lemon Butter Chickpeas", time: 20, servings: "2", ingredients: ["1 can chickpeas, drained", "2 tbsp butter", "2 cloves garlic, sliced", "1/2 lemon, juiced", "1 tsp smoked paprika", "Salt & pepper", "Crusty bread, to serve"],
            steps: ["Melt the butter in a pan over medium heat, add garlic and cook 30 seconds until fragrant.", "Add the chickpeas and paprika, stir to coat, and cook 8–10 minutes until slightly crisped.", "Squeeze in the lemon juice, season with salt and pepper, and cook 1 more minute.", "Serve hot with bread to mop up the butter."]
        },
        {
            title: "15-Minute Shakshuka for One", time: 15, servings: "1", ingredients: ["1 tbsp olive oil", "1/2 onion, diced", "1 clove garlic, minced", "1 cup canned crushed tomatoes", "1/2 tsp cumin", "Pinch of chili flakes", "2 eggs", "Salt & pepper", "Fresh herbs, if you have them"],
            steps: ["Heat oil in a small pan, cook onion 4–5 minutes until soft.", "Add garlic, cumin and chili, cook 30 seconds.", "Pour in the crushed tomatoes, season, and simmer 5 minutes until slightly thickened.", "Make two small wells in the sauce and crack an egg into each. Cover and cook 4–5 minutes until whites are set.", "Finish with herbs and eat straight from the pan."]
        },
        {
            title: "No-Bake Peanut Butter Oat Bites", time: 10, servings: "~12 bites", ingredients: ["1 cup rolled oats", "1/2 cup peanut butter", "1/4 cup honey", "2 tbsp chocolate chips (optional)", "Pinch of salt"],
            steps: ["Mix all ingredients in a bowl until a thick dough forms.", "Roll into small balls, about a tablespoon each.", "Chill in the fridge for at least 20 minutes before eating.", "Store in the fridge for up to a week."]
        }
    ];
    // Only title/ingredients/steps are localized — time and servings are numbers/units, unchanged.
    const RECIPES_AR = [
        {
            title: "نودلز الثوم والفلفل الحار في 5 دقائق", ingredients: ["حصة واحدة من النودلز الجاهزة أو الجافة", "فصّان ثوم مفروم", "ملعقة كبيرة صويا صوص", "ملعقة صغيرة رقائق فلفل حار (أو زيت حار)", "ملعقة صغيرة خل أرز", "نصف ملعقة صغيرة سكر", "ملعقة كبيرة زيت محايد", "بصل أخضر مقطّع للتزيين"],
            steps: ["اسلق النودلز حسب تعليمات العبوة، ثم صفّها وضعها جانبًا.", "أثناء السلق، اخلط الصويا صوص ورقائق الفلفل والخل والسكر في وعاء — هذا هو الصوص.", "سخّن الزيت في مقلاة صغيرة حتى يلمع، ثم اسكبه مباشرة فوق الثوم المفروم في وعاء يتحمل الحرارة. يجب أن يصدر صوت فوران عالٍ.", "أضف النودلز والصوص إلى وعاء الثوم والزيت واخلط جيدًا.", "زيّن بالبصل الأخضر وتناوله فورًا."]
        },
        {
            title: "حمّص بالزبدة والليمون في مقلاة واحدة", ingredients: ["علبة حمّص، مصفّاة", "ملعقتان كبيرتان زبدة", "فصّا ثوم، مقطّعان شرائح", "عصير نصف ليمونة", "ملعقة صغيرة بابريكا مدخّنة", "ملح وفلفل", "خبز مقرمش، للتقديم"],
            steps: ["أذب الزبدة في مقلاة على نار متوسطة، أضف الثوم واطهُ 30 ثانية حتى تفوح رائحته.", "أضف الحمّص والبابريكا، قلّب ليتغطى، واطهُ 8-10 دقائق حتى يصبح مقرمشًا قليلًا.", "أضف عصير الليمون، تبّل بالملح والفلفل، واطهُ دقيقة إضافية.", "قدّمه ساخنًا مع الخبز لتغميسه بالزبدة."]
        },
        {
            title: "شكشوكة في 15 دقيقة لشخص واحد", ingredients: ["ملعقة كبيرة زيت زيتون", "نصف بصلة مقطّعة", "فصّ ثوم مفروم", "كوب طماطم مهروسة معلّبة", "نصف ملعقة صغيرة كمّون", "رشّة رقائق فلفل حار", "بيضتان", "ملح وفلفل", "أعشاب طازجة، إن توفرت"],
            steps: ["سخّن الزيت في مقلاة صغيرة، اطهُ البصل 4-5 دقائق حتى يلين.", "أضف الثوم والكمّون والفلفل، واطهُ 30 ثانية.", "أضف الطماطم المهروسة، تبّل، واترك على نار هادئة 5 دقائق حتى يتكاثف قليلًا.", "اصنع حفرتين صغيرتين في الصوص واكسر بيضة في كل منهما. غطِّ واطهُ 4-5 دقائق حتى يتماسك البياض.", "زيّن بالأعشاب وتناولها مباشرة من المقلاة."]
        },
        {
            title: "كرات الشوفان وزبدة الفول السوداني بدون خَبز", ingredients: ["كوب شوفان ملفوف", "نصف كوب زبدة فول سوداني", "ربع كوب عسل", "ملعقتان كبيرتان رقائق شوكولاتة (اختياري)", "رشّة ملح"],
            steps: ["اخلط كل المكونات في وعاء حتى تتشكل عجينة سميكة.", "شكّلها كرات صغيرة، بحجم ملعقة كبيرة تقريبًا.", "برّدها في الثلاجة 20 دقيقة على الأقل قبل تناولها.", "احفظها في الثلاجة لمدة تصل إلى أسبوع."]
        }
    ];
    const RECIPES_ES = [
        {
            title: "Noodles de ajo y chile en 5 minutos", ingredients: ["1 porción de fideos instantáneos o secos", "2 dientes de ajo, picados", "1 cda de salsa de soja", "1 cdta de hojuelas de chile (o aceite picante)", "1 cdta de vinagre de arroz", "1/2 cdta de azúcar", "1 cda de aceite neutro", "Cebollín en rodajas, para terminar"],
            steps: ["Hierve los fideos según el paquete, luego escurre y reserva.", "Mientras se cocinan, mezcla la salsa de soja, las hojuelas de chile, el vinagre y el azúcar en un bowl — esa es tu salsa.", "Calienta el aceite en una sartén pequeña hasta que brille, luego viértelo directamente sobre el ajo picado en un bowl resistente al calor. Debe chisporrotear fuerte.", "Añade los fideos y la salsa al bowl de ajo con aceite y mezcla bien.", "Corona con cebollín y come de inmediato."]
        },
        {
            title: "Garbanzos con mantequilla y limón en una sola sartén", ingredients: ["1 lata de garbanzos, escurridos", "2 cdas de mantequilla", "2 dientes de ajo, en láminas", "El jugo de 1/2 limón", "1 cdta de pimentón ahumado", "Sal y pimienta", "Pan crujiente, para servir"],
            steps: ["Derrite la mantequilla en una sartén a fuego medio, añade el ajo y cocina 30 segundos hasta que aromatice.", "Añade los garbanzos y el pimentón, mezcla para cubrir, y cocina 8–10 minutos hasta que estén ligeramente crujientes.", "Añade el jugo de limón, sazona con sal y pimienta, y cocina 1 minuto más.", "Sirve caliente con pan para mojar en la mantequilla."]
        },
        {
            title: "Shakshuka de 15 minutos para uno", ingredients: ["1 cda de aceite de oliva", "1/2 cebolla, picada", "1 diente de ajo, picado", "1 taza de tomate triturado en lata", "1/2 cdta de comino", "Una pizca de hojuelas de chile", "2 huevos", "Sal y pimienta", "Hierbas frescas, si tienes"],
            steps: ["Calienta el aceite en una sartén pequeña, cocina la cebolla 4–5 minutos hasta que ablande.", "Añade el ajo, el comino y el chile, cocina 30 segundos.", "Vierte el tomate triturado, sazona, y deja a fuego lento 5 minutos hasta que espese un poco.", "Haz dos pequeños huecos en la salsa y casca un huevo en cada uno. Tapa y cocina 4–5 minutos hasta que la clara cuaje.", "Termina con hierbas y come directo de la sartén."]
        },
        {
            title: "Bocaditos de avena y mantequilla de maní sin horno", ingredients: ["1 taza de avena en hojuelas", "1/2 taza de mantequilla de maní", "1/4 taza de miel", "2 cdas de chispas de chocolate (opcional)", "Una pizca de sal"],
            steps: ["Mezcla todos los ingredientes en un bowl hasta formar una masa espesa.", "Forma bolitas pequeñas, de una cucharada cada una.", "Enfría en el refrigerador al menos 20 minutos antes de comer.", "Guarda en el refrigerador hasta por una semana."]
        }
    ];
    const RECIPES_FR = [
        {
            title: "Nouilles à l'ail et au piment en 5 minutes", ingredients: ["1 portion de nouilles instantanées ou sèches", "2 gousses d'ail, hachées", "1 c. à s. de sauce soja", "1 c. à c. de flocons de piment (ou d'huile pimentée)", "1 c. à c. de vinaigre de riz", "1/2 c. à c. de sucre", "1 c. à s. d'huile neutre", "Ciboule émincée, pour finir"],
            steps: ["Fais bouillir les nouilles selon le paquet, puis égoutte et réserve.", "Pendant la cuisson, mélange la sauce soja, les flocons de piment, le vinaigre et le sucre dans un bol — c'est ta sauce.", "Chauffe l'huile dans une petite poêle jusqu'à ce qu'elle frémisse, puis verse-la directement sur l'ail haché dans un bol résistant à la chaleur. Ça doit grésiller fort.", "Ajoute les nouilles et la sauce au bol d'ail à l'huile et mélange bien.", "Termine avec la ciboule et mange immédiatement."]
        },
        {
            title: "Pois chiches au beurre et citron, une seule poêle", ingredients: ["1 boîte de pois chiches, égouttés", "2 c. à s. de beurre", "2 gousses d'ail, en lamelles", "Le jus d'1/2 citron", "1 c. à c. de paprika fumé", "Sel et poivre", "Pain croustillant, pour servir"],
            steps: ["Fais fondre le beurre dans une poêle à feu moyen, ajoute l'ail et cuis 30 secondes jusqu'à ce que ça embaume.", "Ajoute les pois chiches et le paprika, remue pour enrober, et cuis 8–10 minutes jusqu'à légèrement croustillant.", "Ajoute le jus de citron, assaisonne de sel et de poivre, et cuis 1 minute de plus.", "Sers chaud avec du pain pour saucer le beurre."]
        },
        {
            title: "Chakchouka en 15 minutes pour une personne", ingredients: ["1 c. à s. d'huile d'olive", "1/2 oignon, émincé", "1 gousse d'ail, hachée", "1 tasse de tomates concassées en boîte", "1/2 c. à c. de cumin", "Une pincée de flocons de piment", "2 œufs", "Sel et poivre", "Herbes fraîches, si tu en as"],
            steps: ["Chauffe l'huile dans une petite poêle, cuis l'oignon 4–5 minutes jusqu'à ce qu'il ramollisse.", "Ajoute l'ail, le cumin et le piment, cuis 30 secondes.", "Verse les tomates concassées, assaisonne, et laisse mijoter 5 minutes jusqu'à léger épaississement.", "Fais deux petits puits dans la sauce et casse un œuf dans chacun. Couvre et cuis 4–5 minutes jusqu'à ce que le blanc soit pris.", "Termine avec des herbes et mange directement dans la poêle."]
        },
        {
            title: "Bouchées avoine-beurre de cacahuète sans cuisson", ingredients: ["1 tasse de flocons d'avoine", "1/2 tasse de beurre de cacahuète", "1/4 tasse de miel", "2 c. à s. de pépites de chocolat (facultatif)", "Une pincée de sel"],
            steps: ["Mélange tous les ingrédients dans un bol jusqu'à former une pâte épaisse.", "Forme de petites boules, environ une cuillère à soupe chacune.", "Réfrigère au moins 20 minutes avant de manger.", "Conserve au réfrigérateur jusqu'à une semaine."]
        }
    ];
    const COOKING_READING = { title: "Salt Earlier Than You Think You Should", body: "Most home cooking tastes flat for one boring reason: the salt goes in once, at the end, as an afterthought. Restaurant food tastes different because it's seasoned in layers — a little as the onions cook, a little more as the sauce reduces, a taste and adjustment near the end. Salt doesn't just make food 'saltier'; it's what makes the other flavors already in the pan actually show up. Season earlier, taste more often, and adjust in small moves instead of one big one." };
    const COOKING_READING_AR = { title: "أضف الملح أبكر مما تظن", body: "معظم الطبخ المنزلي يكون بلا نكهة لسبب مملّ واحد: يُضاف الملح مرة واحدة، في النهاية، كفكرة متأخرة. طعام المطاعم مختلف لأنه يُتبَّل على طبقات — قليل عند طهي البصل، قليل آخر عند تقليل الصوص، وتذوّق وتعديل قرب النهاية. الملح لا يجعل الطعام «أكثر ملوحة» فقط؛ إنه ما يجعل النكهات الأخرى الموجودة بالفعل في المقلاة تظهر فعليًا. تبّل مبكرًا، وتذوّق أكثر، وعدّل بخطوات صغيرة بدلًا من خطوة كبيرة واحدة." };
    const COOKING_READING_ES = { title: "Sala antes de lo que crees", body: "La mayoría de la comida casera sabe sosa por una razón aburrida: la sal se añade una sola vez, al final, como ocurrencia tardía. La comida de restaurante sabe distinto porque se sazona en capas — un poco mientras se cocina la cebolla, un poco más mientras reduce la salsa, un ajuste de sabor cerca del final. La sal no solo hace la comida 'más salada'; es lo que hace que los demás sabores que ya están en la sartén realmente se noten. Sazona antes, prueba más seguido, y ajusta con movimientos pequeños en vez de uno grande." };
    const COOKING_READING_FR = { title: "Sale plus tôt que tu ne le penses", body: "La plupart de la cuisine maison a un goût plat pour une raison bête : le sel n'est ajouté qu'une fois, à la fin, comme un après-coup. La cuisine de restaurant a un goût différent parce qu'elle est assaisonnée par couches — un peu pendant que les oignons cuisent, un peu plus pendant que la sauce réduit, un goûter-ajuster vers la fin. Le sel ne rend pas juste la nourriture 'plus salée' ; c'est ce qui fait que les autres saveurs déjà dans la poêle ressortent vraiment. Assaisonne plus tôt, goûte plus souvent, et ajuste par petits gestes plutôt qu'un seul grand." };
    const COOKING_LEARN = [
        { label: "Real technique explainers — Serious Eats", url: "https://www.seriouseats.com/" },
        { label: "Free recipe ideas", url: "https://www.bbcgoodfood.com/recipes" }
    ];
    const COOKING_LEARN_AR = [
        { label: "شروح تقنيات حقيقية — Serious Eats", url: "https://www.seriouseats.com/" },
        { label: "أفكار وصفات مجانية", url: "https://www.bbcgoodfood.com/recipes" }
    ];
    const COOKING_LEARN_ES = [
        { label: "Explicaciones de técnicas reales — Serious Eats", url: "https://www.seriouseats.com/" },
        { label: "Ideas de recetas gratis", url: "https://www.bbcgoodfood.com/recipes" }
    ];
    const COOKING_LEARN_FR = [
        { label: "De vraies explications de techniques — Serious Eats", url: "https://www.seriouseats.com/" },
        { label: "Idées de recettes gratuites", url: "https://www.bbcgoodfood.com/recipes" }
    ];

    // ---- 2.6 Entrepreneurship: concrete steps
    const BUSINESS_TASKS = [
        { title: "Write your idea as one sentence", steps: ["Finish this sentence about your idea: 'I help [who] do [what] without [pain].'", "Say it out loud to yourself — if it's confusing spoken, simplify it.", "Save it somewhere you'll see it again in a week."] },
        { title: "Find 3 people who already have this problem", steps: ["List 3 real people (not hypothetical ones) who deal with the problem your idea solves.", "Message one of them today, plainly: 'I'm exploring an idea for X — can I ask you 2 questions about how you currently handle it?'", "Write down their answer, even if it's just one line."] },
        { title: "Price it in 5 minutes", steps: ["Look up 2 competitors or comparable products and note their prices.", "Pick a number for your version and write down why.", "Notice your gut reaction to saying that price out loud — that reaction is data."] },
        { title: "Build the ugliest possible version", steps: ["Define the smallest thing you could make this week that proves the idea works.", "Cut it down further — remove one more feature than feels comfortable.", "Write today's date next to it as a deadline."] }
    ];
    const BUSINESS_TASKS_AR = [
        { title: "اكتب فكرتك في جملة واحدة", steps: ["أكمل هذه الجملة عن فكرتك: «أساعد [من] على فعل [ماذا] دون [الألم]».", "قلها بصوت عالٍ لنفسك — إن كانت مربكة منطوقة، بسّطها.", "احفظها في مكان ستراه مجددًا بعد أسبوع."] },
        { title: "اعثر على 3 أشخاص لديهم هذه المشكلة بالفعل", steps: ["اذكر 3 أشخاص حقيقيين (وليسوا افتراضيين) يواجهون المشكلة التي تحلها فكرتك.", "راسل أحدهم اليوم، بوضوح: «أستكشف فكرة حول X — هل يمكنني أن أسألك سؤالين عن كيفية تعاملك مع هذا حاليًا؟»", "اكتب إجابته، حتى لو كانت سطرًا واحدًا فقط."] },
        { title: "سعّرها في 5 دقائق", steps: ["ابحث عن منافسَين أو منتجَين مشابهَين ودوّن أسعارهما.", "اختر رقمًا لنسختك واكتب السبب.", "لاحظ ردة فعلك عند قول ذلك السعر بصوت عالٍ — تلك الردة معلومة."] },
        { title: "ابنِ أبسط نسخة ممكنة", steps: ["حدّد أصغر شيء يمكنك صنعه هذا الأسبوع ليثبت أن الفكرة تعمل.", "قلّصها أكثر — أزل ميزة إضافية أكثر مما تشعر بالراحة معه.", "اكتب تاريخ اليوم بجانبها كموعد نهائي."] }
    ];
    const BUSINESS_TASKS_ES = [
        { title: "Escribe tu idea en una sola frase", steps: ["Completa esta frase sobre tu idea: 'Ayudo a [quién] a hacer [qué] sin [el dolor]'.", "Dila en voz alta — si suena confusa hablada, simplifícala.", "Guárdala donde la vuelvas a ver dentro de una semana."] },
        { title: "Encuentra 3 personas que ya tengan este problema", steps: ["Enumera 3 personas reales (no hipotéticas) que enfrenten el problema que resuelve tu idea.", "Escríbele a una de ellas hoy, sin rodeos: 'Estoy explorando una idea sobre X — ¿puedo hacerte 2 preguntas sobre cómo lo manejas ahora?'", "Anota su respuesta, aunque sea una sola línea."] },
        { title: "Ponle precio en 5 minutos", steps: ["Busca 2 competidores o productos comparables y anota sus precios.", "Elige un número para tu versión y escribe por qué.", "Nota tu reacción instintiva al decir ese precio en voz alta — esa reacción es información."] },
        { title: "Construye la versión más fea posible", steps: ["Define lo más pequeño que podrías hacer esta semana para probar que la idea funciona.", "Recórtalo aún más — quita una función más de lo que te resulte cómodo.", "Escribe la fecha de hoy junto a ella como plazo."] }
    ];
    const BUSINESS_TASKS_FR = [
        { title: "Écris ton idée en une seule phrase", steps: ["Complète cette phrase sur ton idée : « J'aide [qui] à faire [quoi] sans [la douleur] ».", "Dis-la à voix haute — si c'est confus à l'oral, simplifie.", "Enregistre-la quelque part où tu la reverras dans une semaine."] },
        { title: "Trouve 3 personnes qui ont déjà ce problème", steps: ["Liste 3 vraies personnes (pas hypothétiques) confrontées au problème que ton idée résout.", "Écris à l'une d'elles aujourd'hui, simplement : « J'explore une idée sur X — je peux te poser 2 questions sur comment tu gères ça actuellement ? »", "Note sa réponse, même en une seule ligne."] },
        { title: "Fixe un prix en 5 minutes", steps: ["Regarde 2 concurrents ou produits comparables et note leurs prix.", "Choisis un chiffre pour ta version et écris pourquoi.", "Remarque ta réaction instinctive en disant ce prix à voix haute — cette réaction, c'est une donnée."] },
        { title: "Construis la version la plus moche possible", steps: ["Définis la plus petite chose que tu pourrais faire cette semaine pour prouver que l'idée fonctionne.", "Réduis encore — enlève une fonctionnalité de plus que ce qui te semble confortable.", "Écris la date d'aujourd'hui à côté comme échéance."] }
    ];
    const BUSINESS_LEARN = [
        { label: "Real founder interviews — How I Built This", url: "https://www.npr.org/podcasts/510313/how-i-built-this" },
        { label: "Free business model canvas", url: "https://www.strategyzer.com/library/the-business-model-canvas" },
        { label: "Y Combinator's startup library", url: "https://www.ycombinator.com/library" }
    ];
    const BUSINESS_LEARN_AR = [
        { label: "مقابلات حقيقية مع مؤسّسين — How I Built This", url: "https://www.npr.org/podcasts/510313/how-i-built-this" },
        { label: "نموذج عمل تجاري مجاني", url: "https://www.strategyzer.com/library/the-business-model-canvas" },
        { label: "مكتبة Y Combinator للشركات الناشئة", url: "https://www.ycombinator.com/library" }
    ];
    const BUSINESS_LEARN_ES = [
        { label: "Entrevistas reales a fundadores — How I Built This", url: "https://www.npr.org/podcasts/510313/how-i-built-this" },
        { label: "Lienzo de modelo de negocio gratuito", url: "https://www.strategyzer.com/library/the-business-model-canvas" },
        { label: "Biblioteca de startups de Y Combinator", url: "https://www.ycombinator.com/library" }
    ];
    const BUSINESS_LEARN_FR = [
        { label: "De vraies interviews de fondateurs — How I Built This", url: "https://www.npr.org/podcasts/510313/how-i-built-this" },
        { label: "Business model canvas gratuit", url: "https://www.strategyzer.com/library/the-business-model-canvas" },
        { label: "La bibliothèque startup de Y Combinator", url: "https://www.ycombinator.com/library" }
    ];
    const BIZ_READING = { title: "Nobody Buys the Idea. They Buy the Problem Solved", body: "It's tempting to fall in love with an idea and spend months refining it in private before showing anyone. But nobody has ever paid for an idea — they pay for a problem going away. The founders who move fastest get uncomfortably specific, early: not 'a better way to manage tasks,' but 'the exact five minutes every Monday morning where this breaks for me.' Specificity is what makes a stranger nod and reach for their wallet — vagueness is what makes them scroll past." };
    const BIZ_READING_AR = { title: "لا أحد يشتري الفكرة. إنهم يشترون حلّ المشكلة", body: "من المغري أن تقع في حب فكرة وتقضي أشهرًا في صقلها سرًا قبل أن تُريها لأحد. لكن لم يدفع أحد قط ثمن فكرة — إنهم يدفعون ثمن اختفاء مشكلة. المؤسّسون الأسرع تحركًا يصبحون محدّدين بشكل مزعج، وباكرًا: ليس «طريقة أفضل لإدارة المهام»، بل «الخمس دقائق بالضبط كل صباح اثنين التي ينهار فيها هذا بالنسبة لي». التحديد هو ما يجعل الغريب يومئ برأسه ويمدّ يده لمحفظته — الغموض هو ما يجعله يتجاوزك بالتمرير." };
    const BIZ_READING_ES = { title: "Nadie compra la idea. Compran el problema resuelto", body: "Es tentador enamorarse de una idea y pasar meses puliéndola en privado antes de mostrársela a alguien. Pero nadie ha pagado nunca por una idea — pagan porque un problema desaparezca. Los fundadores que avanzan más rápido se vuelven incómodamente específicos, pronto: no 'una mejor forma de gestionar tareas', sino 'los cinco minutos exactos cada lunes por la mañana en que esto se rompe para mí'. La especificidad es lo que hace que un desconocido asienta y saque la cartera — la vaguedad es lo que lo hace seguir haciendo scroll." };
    const BIZ_READING_FR = { title: "Personne n'achète l'idée. On achète le problème résolu", body: "C'est tentant de tomber amoureux d'une idée et de passer des mois à la peaufiner en privé avant de la montrer à qui que ce soit. Mais personne n'a jamais payé pour une idée — on paie pour qu'un problème disparaisse. Les fondateurs qui avancent le plus vite deviennent inconfortablement précis, tôt : pas « une meilleure façon de gérer les tâches », mais « les cinq minutes exactes chaque lundi matin où ça casse pour moi ». La précision, c'est ce qui fait qu'un inconnu hoche la tête et sort son portefeuille — le flou, c'est ce qui le fait continuer à scroller." };

    // ---- 2.7 Fitness / Sports / Wellness: real short routines
    const FITNESS_ROUTINES = [
        { title: "5-minute mobility reset", steps: ["30s neck rolls, each direction", "10 shoulder circles, each direction", "10 cat-cow stretches", "30s hip circles, each direction", "10 ankle rolls, each foot"] },
        { title: "Bodyweight burst (no equipment)", steps: ["12 squats", "10 push-ups (knees down is fine)", "20s plank", "12 lunges (6 each leg)", "Repeat once more if you have time"] },
        { title: "Desk-break stretch", steps: ["Stand and reach overhead for 15s", "Forward fold for 20s", "Seated spinal twist, 15s each side", "Wrist and forearm stretch, 15s each"] }
    ];
    const FITNESS_ROUTINES_AR = [
        { title: "إعادة ضبط الحركة في 5 دقائق", steps: ["30 ثانية لفّ الرقبة، كل اتجاه", "10 دورات كتف، كل اتجاه", "10 تمارين تمدد القطة والبقرة", "30 ثانية دورات ورك، كل اتجاه", "10 لفّات كاحل، كل قدم"] },
        { title: "دفعة بوزن الجسم (بدون معدات)", steps: ["12 قرفصاء", "10 تمارين ضغط (يمكن على الركبتين)", "20 ثانية بلانك", "12 اندفاعة أمامية (6 لكل رجل)", "كرّر مرة أخرى إن سمح الوقت"] },
        { title: "تمدد استراحة المكتب", steps: ["قف ومدّ يديك للأعلى لمدة 15 ثانية", "انحناء أمامي لمدة 20 ثانية", "التواء العمود الفقري جالسًا، 15 ثانية لكل جانب", "تمدد المعصم والساعد، 15 ثانية لكل منهما"] }
    ];
    const FITNESS_ROUTINES_ES = [
        { title: "Reinicio de movilidad de 5 minutos", steps: ["30s de círculos de cuello, cada dirección", "10 círculos de hombro, cada dirección", "10 estiramientos de gato-vaca", "30s de círculos de cadera, cada dirección", "10 giros de tobillo, cada pie"] },
        { title: "Ráfaga con peso corporal (sin equipo)", steps: ["12 sentadillas", "10 flexiones (con rodillas apoyadas está bien)", "20s de plancha", "12 zancadas (6 por pierna)", "Repite una vez más si tienes tiempo"] },
        { title: "Estiramiento de pausa de escritorio", steps: ["Ponte de pie y estira los brazos hacia arriba 15s", "Flexión hacia adelante 20s", "Giro de columna sentado, 15s cada lado", "Estiramiento de muñeca y antebrazo, 15s cada uno"] }
    ];
    const FITNESS_ROUTINES_FR = [
        { title: "Reset mobilité de 5 minutes", steps: ["30s de rotations du cou, chaque sens", "10 cercles d'épaules, chaque sens", "10 étirements chat-vache", "30s de cercles de hanches, chaque sens", "10 rotations de cheville, chaque pied"] },
        { title: "Sprint au poids du corps (sans matériel)", steps: ["12 squats", "10 pompes (genoux au sol, ça marche aussi)", "20s de gainage", "12 fentes (6 par jambe)", "Recommence une fois si tu as le temps"] },
        { title: "Étirement pause bureau", steps: ["Debout, étire les bras vers le haut 15s", "Flexion avant 20s", "Torsion de la colonne assis, 15s de chaque côté", "Étirement du poignet et de l'avant-bras, 15s chacun"] }
    ];
    const SPORTS_DRILLS = [
        { title: "Ball-control ladder (any ball sport)", steps: ["2 min of soft touches, both hands/feet", "2 min of moving touches while walking", "1 min of quick direction changes"] },
        { title: "Reaction & footwork", steps: ["30s high-knees", "30s lateral shuffles, each direction", "30s quick-feet in place"] }
    ];
    const SPORTS_DRILLS_AR = [
        { title: "سلّم التحكم بالكرة (أي رياضة كرة)", steps: ["دقيقتان من اللمسات الخفيفة، باليدين/القدمين", "دقيقتان من اللمسات المتحركة أثناء المشي", "دقيقة من تغييرات الاتجاه السريعة"] },
        { title: "رد الفعل وحركة القدمين", steps: ["30 ثانية رفع ركبتين عاليًا", "30 ثانية خطوات جانبية، كل اتجاه", "30 ثانية قدمان سريعتان في المكان"] }
    ];
    const SPORTS_DRILLS_ES = [
        { title: "Escalera de control de balón (cualquier deporte de balón)", steps: ["2 min de toques suaves, con ambas manos/pies", "2 min de toques en movimiento mientras caminas", "1 min de cambios rápidos de dirección"] },
        { title: "Reacción y trabajo de pies", steps: ["30s de rodillas altas", "30s de desplazamientos laterales, cada dirección", "30s de pies rápidos en el sitio"] }
    ];
    const SPORTS_DRILLS_FR = [
        { title: "Échelle de contrôle de balle (tout sport de balle)", steps: ["2 min de touches douces, mains/pieds", "2 min de touches en mouvement en marchant", "1 min de changements de direction rapides"] },
        { title: "Réaction et jeu de jambes", steps: ["30s de montées de genoux", "30s de déplacements latéraux, chaque direction", "30s de pas rapides sur place"] }
    ];
    const SPORTS_READING = { title: "Watch the Game Differently Than You Play It", body: "Most people watching a sport track the ball. The athletes who improve fastest also watch what happens away from it — the footwork before the pass, the positioning before the shot goes up, the split-second decision that made the highlight possible three seconds before it happened. Studying your sport isn't just playing more of it; it's slowing down and noticing the setup, not just the result. That's a skill you can practice from a couch." };
    const SPORTS_READING_AR = { title: "شاهد اللعبة بشكل مختلف عن لعبها", body: "معظم الناس عند مشاهدة رياضة يتابعون الكرة. الرياضيون الذين يتحسّنون أسرع يشاهدون أيضًا ما يحدث بعيدًا عنها — حركة القدمين قبل التمريرة، التمركز قبل التسديدة، القرار الذي استغرق جزءًا من الثانية وجعل اللقطة الرائعة ممكنة قبل ثلاث ثوانٍ من حدوثها. دراسة رياضتك ليست فقط ممارستها أكثر؛ إنها التمهّل وملاحظة الإعداد، وليس النتيجة فقط. هذه مهارة يمكنك التدرب عليها من الأريكة." };
    const SPORTS_READING_ES = { title: "Observa el juego distinto a como lo juegas", body: "La mayoría de la gente que mira un deporte sigue el balón. Los atletas que más rápido mejoran también observan lo que pasa lejos de él — el trabajo de pies antes del pase, el posicionamiento antes del tiro, la decisión de una fracción de segundo que hizo posible la jugada destacada tres segundos antes de que ocurriera. Estudiar tu deporte no es solo jugarlo más; es ir más despacio y notar la preparación, no solo el resultado. Es una habilidad que puedes practicar desde el sofá." };
    const SPORTS_READING_FR = { title: "Regarde le match différemment de la façon dont tu joues", body: "La plupart des gens qui regardent un sport suivent le ballon. Les athlètes qui progressent le plus vite observent aussi ce qui se passe ailleurs — le jeu de jambes avant la passe, le positionnement avant le tir, la décision d'une fraction de seconde qui a rendu l'action possible trois secondes avant qu'elle n'arrive. Étudier ton sport, ce n'est pas juste le pratiquer davantage ; c'est ralentir et remarquer la mise en place, pas seulement le résultat. C'est une compétence que tu peux entraîner depuis ton canapé." };
    const SPORTS_LEARN = [
        { label: "How to study game film", url: "https://www.youtube.com/results?search_query=how+to+watch+game+film+like+an+athlete" }
    ];
    const SPORTS_LEARN_AR = [
        { label: "كيفية دراسة تسجيلات المباريات", url: "https://www.youtube.com/results?search_query=how+to+watch+game+film+like+an+athlete" }
    ];
    const SPORTS_LEARN_ES = [
        { label: "Cómo estudiar el video de un partido", url: "https://www.youtube.com/results?search_query=how+to+watch+game+film+like+an+athlete" }
    ];
    const SPORTS_LEARN_FR = [
        { label: "Comment étudier les images de match", url: "https://www.youtube.com/results?search_query=how+to+watch+game+film+like+an+athlete" }
    ];
    const WELLNESS_ROUTINES = [
        { title: "Box breathing", steps: ["Inhale for 4 counts", "Hold for 4 counts", "Exhale for 4 counts", "Hold for 4 counts", "Repeat for 5 rounds"] },
        { title: "Three-things journal", steps: ["Write one thing that went okay today, however small", "Write one thing you're mildly looking forward to", "Write one thing you can let go of before bed"] },
        { title: "Five-senses grounding", steps: ["Name 5 things you can see", "Name 4 things you can feel", "Name 3 things you can hear", "Name 2 things you can smell", "Name 1 thing you can taste"] }
    ];
    const WELLNESS_ROUTINES_AR = [
        { title: "التنفس المربّع", steps: ["استنشق لأربع عدّات", "احبس لأربع عدّات", "ازفر لأربع عدّات", "احبس لأربع عدّات", "كرّر لخمس جولات"] },
        { title: "يوميات الأشياء الثلاثة", steps: ["اكتب شيئًا واحدًا سار بخير اليوم، مهما كان صغيرًا", "اكتب شيئًا واحدًا تتطلع إليه ولو قليلًا", "اكتب شيئًا واحدًا يمكنك تركه قبل النوم"] },
        { title: "التأريض بالحواس الخمس", steps: ["اذكر 5 أشياء يمكنك رؤيتها", "اذكر 4 أشياء يمكنك الشعور بها", "اذكر 3 أشياء يمكنك سماعها", "اذكر شيئين يمكنك شمّهما", "اذكر شيئًا واحدًا يمكنك تذوّقه"] }
    ];
    const WELLNESS_ROUTINES_ES = [
        { title: "Respiración cuadrada", steps: ["Inhala durante 4 tiempos", "Sostén durante 4 tiempos", "Exhala durante 4 tiempos", "Sostén durante 4 tiempos", "Repite 5 rondas"] },
        { title: "Diario de tres cosas", steps: ["Escribe una cosa que salió bien hoy, por pequeña que sea", "Escribe una cosa que esperas con algo de ganas", "Escribe una cosa que puedas soltar antes de dormir"] },
        { title: "Anclaje de los cinco sentidos", steps: ["Nombra 5 cosas que puedas ver", "Nombra 4 cosas que puedas sentir", "Nombra 3 cosas que puedas oír", "Nombra 2 cosas que puedas oler", "Nombra 1 cosa que puedas saborear"] }
    ];
    const WELLNESS_ROUTINES_FR = [
        { title: "Respiration carrée", steps: ["Inspire pendant 4 temps", "Retiens pendant 4 temps", "Expire pendant 4 temps", "Retiens pendant 4 temps", "Répète pendant 5 tours"] },
        { title: "Journal des trois choses", steps: ["Écris une chose qui s'est bien passée aujourd'hui, même minime", "Écris une chose que tu attends avec un peu d'impatience", "Écris une chose que tu peux lâcher avant de dormir"] },
        { title: "Ancrage aux cinq sens", steps: ["Nomme 5 choses que tu peux voir", "Nomme 4 choses que tu peux sentir (au toucher)", "Nomme 3 choses que tu peux entendre", "Nomme 2 choses que tu peux sentir (à l'odorat)", "Nomme 1 chose que tu peux goûter"] }
    ];
    const WELLNESS_READING = { title: "Rest Is Not the Reward for Work", body: "Most people treat rest as something you earn after you've pushed hard enough — a prize at the end of the to-do list. But rest isn't a reward sitting at the finish line; it's part of the machinery that lets you keep going at all. Athletes don't rest because they're done training. They rest because the recovery IS the training. The same is true for a mind that's been running all day: the pause isn't a break from the work. It's what makes the next round of it possible." };
    const WELLNESS_READING_AR = { title: "الراحة ليست مكافأة على العمل", body: "معظم الناس يعاملون الراحة كشيء تكسبه بعد أن تكون قد اجتهدت بما فيه الكفاية — جائزة في نهاية قائمة المهام. لكن الراحة ليست مكافأة تنتظر عند خط النهاية؛ إنها جزء من الآلية التي تتيح لك الاستمرار أصلًا. الرياضيون لا يرتاحون لأنهم انتهوا من التدريب. إنهم يرتاحون لأن التعافي هو التدريب. الأمر نفسه صحيح لعقل ظل يعمل طوال اليوم: التوقف ليس استراحة من العمل. إنه ما يجعل الجولة التالية منه ممكنة." };
    const WELLNESS_READING_ES = { title: "El descanso no es la recompensa por trabajar", body: "La mayoría de la gente trata el descanso como algo que te ganas después de haberte esforzado lo suficiente — un premio al final de la lista de tareas. Pero el descanso no es una recompensa que espera en la meta; es parte de la maquinaria que te permite seguir adelante. Los atletas no descansan porque hayan terminado de entrenar. Descansan porque la recuperación ES el entrenamiento. Lo mismo es cierto para una mente que ha estado funcionando todo el día: la pausa no es un descanso del trabajo. Es lo que hace posible la siguiente ronda." };
    const WELLNESS_READING_FR = { title: "Le repos n'est pas la récompense du travail", body: "La plupart des gens traitent le repos comme quelque chose qu'on gagne après avoir assez poussé — un prix au bout de la liste de tâches. Mais le repos n'est pas une récompense qui attend à la ligne d'arrivée ; il fait partie du mécanisme qui te permet de continuer, tout court. Les athlètes ne se reposent pas parce qu'ils ont fini de s'entraîner. Ils se reposent parce que la récupération EST l'entraînement. C'est pareil pour un esprit qui a tourné toute la journée : la pause n'est pas une coupure du travail. C'est ce qui rend le prochain round possible." };
    const WELLNESS_LEARN = [
        { label: "Free guided meditations — Headspace", url: "https://www.headspace.com/" },
        { label: "Sleep & recovery basics", url: "https://www.sleepfoundation.org/" }
    ];
    const WELLNESS_LEARN_AR = [
        { label: "تأملات موجّهة مجانية — Headspace", url: "https://www.headspace.com/" },
        { label: "أساسيات النوم والتعافي", url: "https://www.sleepfoundation.org/" }
    ];
    const WELLNESS_LEARN_ES = [
        { label: "Meditaciones guiadas gratis — Headspace", url: "https://www.headspace.com/" },
        { label: "Fundamentos de sueño y recuperación", url: "https://www.sleepfoundation.org/" }
    ];
    const WELLNESS_LEARN_FR = [
        { label: "Méditations guidées gratuites — Headspace", url: "https://www.headspace.com/" },
        { label: "Bases du sommeil et de la récupération", url: "https://www.sleepfoundation.org/" }
    ];

    // ---- 2.8 Photography prompts
    const PHOTO_PROMPTS = [
        "Find the most interesting shadow near you and photograph just the shadow, not its source.",
        "Take 3 photos of the same object from 3 very different angles — floor level, eye level, above.",
        "Photograph something red. Don't move it — find it where it already is.",
        "Take one photo where the subject fills less than 10% of the frame.",
        "Photograph reflections — in glass, water, a screen, a spoon."
    ];
    const PHOTO_PROMPTS_AR = [
        "ابحث عن أكثر ظلّ مثير للاهتمام بالقرب منك وصوّر الظل فقط، وليس مصدره.",
        "التقط 3 صور للشيء نفسه من 3 زوايا مختلفة جدًا — من مستوى الأرض، ومستوى العين، ومن الأعلى.",
        "صوّر شيئًا أحمر اللون. لا تحرّكه — ابحث عنه حيث هو موجود بالفعل.",
        "التقط صورة واحدة يشغل فيها الموضوع أقل من 10% من الإطار.",
        "صوّر انعكاسات — في زجاج، أو ماء، أو شاشة، أو ملعقة."
    ];
    const PHOTO_PROMPTS_ES = [
        "Encuentra la sombra más interesante cerca de ti y fotografía solo la sombra, no lo que la proyecta.",
        "Toma 3 fotos del mismo objeto desde 3 ángulos muy distintos — al ras del suelo, a la altura de los ojos, desde arriba.",
        "Fotografía algo rojo. No lo muevas — encuéntralo donde ya está.",
        "Toma una foto donde el sujeto ocupe menos del 10% del encuadre.",
        "Fotografía reflejos — en vidrio, agua, una pantalla, una cuchara."
    ];
    const PHOTO_PROMPTS_FR = [
        "Trouve l'ombre la plus intéressante près de toi et photographie seulement l'ombre, pas ce qui la projette.",
        "Prends 3 photos du même objet sous 3 angles très différents — au ras du sol, à hauteur d'yeux, du dessus.",
        "Photographie quelque chose de rouge. Ne le déplace pas — trouve-le là où il est déjà.",
        "Prends une photo où le sujet occupe moins de 10% du cadre.",
        "Photographie des reflets — dans du verre, de l'eau, un écran, une cuillère."
    ];
    const PHOTO_LEARN = [
        { label: "Composition basics", url: "https://www.youtube.com/results?search_query=rule+of+thirds+photography+beginners" },
        { label: "Free editing app — Snapseed / Lightroom Mobile", url: "https://www.adobe.com/products/photoshop-lightroom.html" },
        { label: "Inspiration — Unsplash", url: "https://unsplash.com/" }
    ];
    const PHOTO_LEARN_AR = [
        { label: "أساسيات التكوين", url: "https://www.youtube.com/results?search_query=rule+of+thirds+photography+beginners" },
        { label: "تطبيق تحرير مجاني — Snapseed / Lightroom Mobile", url: "https://www.adobe.com/products/photoshop-lightroom.html" },
        { label: "إلهام — Unsplash", url: "https://unsplash.com/" }
    ];
    const PHOTO_LEARN_ES = [
        { label: "Fundamentos de composición", url: "https://www.youtube.com/results?search_query=rule+of+thirds+photography+beginners" },
        { label: "App de edición gratis — Snapseed / Lightroom Mobile", url: "https://www.adobe.com/products/photoshop-lightroom.html" },
        { label: "Inspiración — Unsplash", url: "https://unsplash.com/" }
    ];
    const PHOTO_LEARN_FR = [
        { label: "Les bases de la composition", url: "https://www.youtube.com/results?search_query=rule+of+thirds+photography+beginners" },
        { label: "Appli de retouche gratuite — Snapseed / Lightroom Mobile", url: "https://www.adobe.com/products/photoshop-lightroom.html" },
        { label: "Inspiration — Unsplash", url: "https://unsplash.com/" }
    ];
    const PHOTO_READING = { title: "The Best Camera Is a Decision, Not a Device", body: "New photographers chase better equipment before they've exhausted what a phone camera can already do — because the real skill isn't in the sensor, it's in the decision of where to stand. Move three feet left. Get low. Wait ninety seconds for the light to shift. Almost every photo that stops someone mid-scroll was made by a decision, not a device. Master the decision first; the gear upgrade will matter far less than you expect once you do." };
    const PHOTO_READING_AR = { title: "أفضل كاميرا هي قرار، لا جهاز", body: "المصورون الجدد يطاردون معدات أفضل قبل أن يستنفدوا ما يمكن لكاميرا الهاتف فعله بالفعل — لأن المهارة الحقيقية ليست في المستشعر، بل في قرار أين تقف. تحرّك ثلاث أقدام لليسار. انخفض. انتظر تسعين ثانية حتى يتغير الضوء. تقريبًا كل صورة توقف شخصًا في منتصف التمرير صُنعت بقرار، لا بجهاز. أتقن القرار أولًا؛ ترقية المعدات ستهم أقل بكثير مما تتوقع بمجرد أن تفعل." };
    const PHOTO_READING_ES = { title: "La mejor cámara es una decisión, no un dispositivo", body: "Los fotógrafos nuevos persiguen mejor equipo antes de haber agotado lo que ya puede hacer una cámara de teléfono — porque la habilidad real no está en el sensor, está en la decisión de dónde pararte. Muévete un metro a la izquierda. Agáchate. Espera noventa segundos a que cambie la luz. Casi toda foto que detiene a alguien en medio del scroll fue hecha por una decisión, no por un dispositivo. Domina primero la decisión; la mejora de equipo importará mucho menos de lo que esperas una vez que lo hagas." };
    const PHOTO_READING_FR = { title: "Le meilleur appareil photo est une décision, pas un objet", body: "Les nouveaux photographes courent après du meilleur matériel avant d'avoir épuisé ce qu'un téléphone peut déjà faire — parce que le vrai talent n'est pas dans le capteur, il est dans la décision d'où se placer. Déplace-toi d'un mètre à gauche. Baisse-toi. Attends quatre-vingt-dix secondes que la lumière change. Presque chaque photo qui arrête quelqu'un en plein scroll a été faite par une décision, pas par un objet. Maîtrise d'abord la décision ; la mise à niveau du matériel comptera bien moins que prévu une fois que tu le feras." };

    // ---- 2.9 Museums & culture: real short pieces
    const CULTURE_PIECES = [
        { title: "Why 'The Starry Night' isn't a calm painting", body: "Van Gogh painted it from memory, from the window of the asylum at Saint-Rémy, in the months after he'd cut off part of his own ear. The sky isn't decorative swirling — it mirrors the turbulence he described in his letters to his brother Theo. What reads today as a soothing print was, at the time, one of the most emotionally raw skies ever put on canvas." },
        { title: "The unfinished sculptures Michelangelo left on purpose", body: "Michelangelo's 'Prisoners' series shows human figures seemingly trapped inside blocks of marble, arms and torsos emerging from raw, unworked stone. He left them intentionally incomplete — a visual argument that the figure already existed inside the marble, and his job was only to remove what didn't belong." },
        { title: "Why museums keep rooms almost empty", body: "Curators call it 'breathing room' — the deliberate blank wall space around a single painting. It's not a budget shortfall; it's a design choice, forcing your eye to slow down on one work instead of skimming a wall of them, the same instinct behind a finite, uncluttered feed." }
    ];
    const CULTURE_PIECES_AR = [
        { title: "لماذا 'الليلة المرصعة بالنجوم' ليست لوحة هادئة", body: "رسمها فان جوخ من الذاكرة، من نافذة مصحّة سان-ريمي، في الأشهر التي تلت قطعه جزءًا من أذنه. السماء ليست دوامة زخرفية — إنها تعكس الاضطراب الذي وصفه في رسائله لأخيه ثيو. ما يُقرأ اليوم كطبعة مهدّئة كان، في ذلك الوقت، واحدة من أكثر السماوات خامًا من الناحية العاطفية التي وُضعت على قماش على الإطلاق." },
        { title: "المنحوتات غير المكتملة التي تركها مايكل أنجلو عمدًا", body: "سلسلة 'السجناء' لمايكل أنجلو تُظهر أشكالًا بشرية تبدو محاصرة داخل كتل من الرخام، بأذرع وجذوع تخرج من حجر خام لم يُشغَّل. تركها ناقصة عمدًا — حجة بصرية على أن الشكل كان موجودًا بالفعل داخل الرخام، وأن مهمته كانت فقط إزالة ما لا ينتمي إليه." },
        { title: "لماذا تُبقي المتاحف الغرف شبه فارغة", body: "يسمّيها القيّمون 'مساحة للتنفس' — الفراغ المتعمد على الحائط حول لوحة واحدة. ليس نقصًا في الميزانية؛ إنه خيار تصميمي، يجبر عينك على التمهّل عند عمل واحد بدلًا من تصفح جدار مليء بها، الغريزة نفسها وراء خلاصة محدودة وغير مزدحمة." }
    ];
    const CULTURE_PIECES_ES = [
        { title: "Por qué 'La noche estrellada' no es un cuadro tranquilo", body: "Van Gogh la pintó de memoria, desde la ventana del asilo de Saint-Rémy, en los meses posteriores a cortarse parte de su propia oreja. El cielo no es un remolino decorativo — refleja la turbulencia que describió en sus cartas a su hermano Theo. Lo que hoy se lee como una lámina relajante fue, en su momento, uno de los cielos más crudos emocionalmente jamás puestos en un lienzo." },
        { title: "Las esculturas inacabadas que Miguel Ángel dejó a propósito", body: "La serie 'Prisioneros' de Miguel Ángel muestra figuras humanas aparentemente atrapadas dentro de bloques de mármol, con brazos y torsos emergiendo de piedra en bruto sin trabajar. Las dejó incompletas intencionalmente — un argumento visual de que la figura ya existía dentro del mármol, y su trabajo era solo retirar lo que no pertenecía." },
        { title: "Por qué los museos mantienen las salas casi vacías", body: "Los curadores lo llaman 'espacio para respirar' — el espacio de pared en blanco deliberado alrededor de una sola obra. No es un recorte de presupuesto; es una decisión de diseño, que obliga a tu mirada a detenerse en una obra en vez de pasar rápido por una pared llena de ellas, el mismo instinto detrás de un feed finito y despejado." }
    ];
    const CULTURE_PIECES_FR = [
        { title: "Pourquoi « La Nuit étoilée » n'est pas un tableau calme", body: "Van Gogh l'a peinte de mémoire, depuis la fenêtre de l'asile de Saint-Rémy, dans les mois qui ont suivi le moment où il s'est coupé une partie de l'oreille. Le ciel n'est pas un tourbillon décoratif — il reflète la turbulence qu'il décrivait dans ses lettres à son frère Théo. Ce qui se lit aujourd'hui comme une impression apaisante était, à l'époque, l'un des ciels les plus bruts émotionnellement jamais posés sur une toile." },
        { title: "Les sculptures inachevées que Michel-Ange a laissées exprès", body: "La série des « Esclaves » de Michel-Ange montre des figures humaines apparemment prisonnières de blocs de marbre, bras et torses émergeant d'une pierre brute, non travaillée. Il les a laissées volontairement incomplètes — un argument visuel selon lequel la figure existait déjà à l'intérieur du marbre, et que son travail n'était que d'enlever ce qui n'y appartenait pas." },
        { title: "Pourquoi les musées gardent des salles presque vides", body: "Les conservateurs appellent ça de « l'espace pour respirer » — le mur délibérément vide autour d'une seule toile. Ce n'est pas un manque de budget ; c'est un choix de design, qui force ton œil à ralentir sur une œuvre plutôt que de survoler un mur qui en est couvert, le même instinct derrière un fil d'actualité fini et épuré." }
    ];
    const CULTURE_LINKS = [
        { label: "Free virtual museum tours", url: "https://artsandculture.google.com/" },
        { label: "Local exhibitions", url: "https://www.eventbrite.com/d/online/museum-exhibit/" }
    ];
    const CULTURE_LINKS_AR = [
        { label: "جولات متاحف افتراضية مجانية", url: "https://artsandculture.google.com/" },
        { label: "معارض محلية", url: "https://www.eventbrite.com/d/online/museum-exhibit/" }
    ];
    const CULTURE_LINKS_ES = [
        { label: "Tours virtuales gratis por museos", url: "https://artsandculture.google.com/" },
        { label: "Exposiciones locales", url: "https://www.eventbrite.com/d/online/museum-exhibit/" }
    ];
    const CULTURE_LINKS_FR = [
        { label: "Visites virtuelles de musées gratuites", url: "https://artsandculture.google.com/" },
        { label: "Expositions locales", url: "https://www.eventbrite.com/d/online/museum-exhibit/" }
    ];

    // ---- 2.10 Events
    const EVENTS_TASKS = [
        { title: "Find one real thing happening near you this week", steps: ["Open a local listings site and filter to this week", "Pick one event that's slightly outside your usual taste", "Text a friend the link, plainly: 'want to go to this?'"] },
        { title: "Plan a no-cost outing", steps: ["Pick a neighborhood you rarely visit", "Look up one free thing to do there (park, market, gallery)", "Block 60 minutes on your calendar for it, this week"] }
    ];
    const EVENTS_TASKS_AR = [
        { title: "ابحث عن شيء حقيقي واحد يحدث بالقرب منك هذا الأسبوع", steps: ["افتح موقع فعاليات محلي وصفّه لهذا الأسبوع", "اختر فعالية واحدة خارج ذوقك المعتاد قليلًا", "أرسل الرابط لصديق، ببساطة: «تحب تروح لهاد؟»"] },
        { title: "خطّط لخرجة بلا تكلفة", steps: ["اختر حيًا نادرًا ما تزوره", "ابحث عن شيء مجاني واحد تفعله هناك (حديقة، سوق، معرض)", "احجز 60 دقيقة في تقويمك له، هذا الأسبوع"] }
    ];
    const EVENTS_TASKS_ES = [
        { title: "Encuentra algo real que pase cerca de ti esta semana", steps: ["Abre un sitio de eventos locales y filtra por esta semana", "Elige un evento algo fuera de tu gusto habitual", "Envíale el enlace a un amigo, sin más: '¿te apuntas a esto?'"] },
        { title: "Planea una salida sin costo", steps: ["Elige un barrio que casi nunca visitas", "Busca una cosa gratis que hacer ahí (parque, mercado, galería)", "Bloquea 60 minutos en tu calendario para eso, esta semana"] }
    ];
    const EVENTS_TASKS_FR = [
        { title: "Trouve un vrai truc qui se passe près de toi cette semaine", steps: ["Ouvre un site d'annonces locales et filtre sur cette semaine", "Choisis un événement légèrement en dehors de tes goûts habituels", "Envoie le lien à un ami, simplement : « ça te dit ? »"] },
        { title: "Planifie une sortie gratuite", steps: ["Choisis un quartier que tu visites rarement", "Cherche une chose gratuite à y faire (parc, marché, galerie)", "Bloque 60 minutes dans ton agenda pour ça, cette semaine"] }
    ];
    const EVENTS_LINKS = [
        { label: "Find local events", url: "https://www.eventbrite.com/d/online/local-events/" }
    ];
    const EVENTS_LINKS_AR = [
        { label: "ابحث عن فعاليات محلية", url: "https://www.eventbrite.com/d/online/local-events/" }
    ];
    const EVENTS_LINKS_ES = [
        { label: "Encuentra eventos locales", url: "https://www.eventbrite.com/d/online/local-events/" }
    ];
    const EVENTS_LINKS_FR = [
        { label: "Trouve des événements locaux", url: "https://www.eventbrite.com/d/online/local-events/" }
    ];
    const EVENTS_READING = { title: "The Best Parties Have a Reason to End", body: "An event with no shape — no start, no arc, no natural close — quietly exhausts everyone in the room, even the host. The gatherings people remember usually have a rhythm: an opening moment that pulls people in, a peak, and a clear, graceful close instead of a slow fade of everyone checking their phones. If you're planning something, spend less time on the guest list and more time on the shape of the two hours — when it starts, what the high point is, and how it ends." };
    const EVENTS_READING_AR = { title: "أفضل الحفلات لها سبب لتنتهي", body: "الفعالية بلا شكل — بلا بداية، بلا تصاعد، بلا نهاية طبيعية — تُنهك الجميع في الغرفة بهدوء، حتى المضيف. التجمعات التي يتذكرها الناس عادة لها إيقاع: لحظة افتتاحية تجذب الناس، ذروة، ونهاية واضحة وأنيقة بدلًا من تلاشٍ بطيء يتفقد فيه الجميع هواتفهم. إن كنت تخطط لشيء، اقضِ وقتًا أقل على قائمة الضيوف ووقتًا أكثر على شكل الساعتين — متى تبدأ، ما هي الذروة، وكيف تنتهي." };
    const EVENTS_READING_ES = { title: "Las mejores fiestas tienen una razón para terminar", body: "Un evento sin forma — sin inicio, sin arco, sin cierre natural — agota silenciosamente a todos en la sala, incluso al anfitrión. Las reuniones que la gente recuerda suelen tener un ritmo: un momento de apertura que atrae a la gente, un punto álgido, y un cierre claro y elegante en vez de un apagón lento donde todos revisan su teléfono. Si estás planeando algo, dedica menos tiempo a la lista de invitados y más a la forma de esas dos horas — cuándo empieza, cuál es el punto álgido, y cómo termina." };
    const EVENTS_READING_FR = { title: "Les meilleures fêtes ont une raison de se terminer", body: "Un événement sans forme — sans début, sans arc, sans fin naturelle — épuise silencieusement tout le monde dans la pièce, même l'hôte. Les rassemblements dont les gens se souviennent ont généralement un rythme : un moment d'ouverture qui attire les gens, un pic, et une fin claire et élégante plutôt qu'un lent effacement où tout le monde consulte son téléphone. Si tu planifies quelque chose, passe moins de temps sur la liste d'invités et plus sur la forme de ces deux heures — quand ça commence, quel est le point culminant, et comment ça se termine." };

    // ---- 2.11 Music
    const MUSIC_TASKS = [
        { title: "Active listening: one album, no multitasking", steps: ["Pick one album you've never fully heard front to back", "Put on headphones, no other tabs or apps open", "Notice one instrument you don't usually pay attention to"] },
        { title: "Learn the first 4 bars of something", steps: ["Pick a very short, simple riff or chord progression", "Search a beginner tutorial for it", "Play or hum it slowly 5 times in a row"] }
    ];
    const MUSIC_TASKS_AR = [
        { title: "استماع فعّال: ألبوم واحد، بلا تعدد مهام", steps: ["اختر ألبومًا لم تسمعه كاملًا من قبل من البداية للنهاية", "ضع سماعات الرأس، بلا تبويبات أو تطبيقات أخرى مفتوحة", "لاحظ آلة موسيقية واحدة لا تنتبه لها عادة"] },
        { title: "تعلّم أول 4 مقاطع موسيقية من شيء ما", steps: ["اختر لازمة قصيرة وبسيطة جدًا أو تتابع أوتار", "ابحث عن درس للمبتدئين لها", "اعزفها أو دندنها ببطء 5 مرات متتالية"] }
    ];
    const MUSIC_TASKS_ES = [
        { title: "Escucha activa: un álbum, sin multitarea", steps: ["Elige un álbum que nunca hayas escuchado completo de principio a fin", "Ponte auriculares, sin otras pestañas o apps abiertas", "Nota un instrumento al que normalmente no le prestas atención"] },
        { title: "Aprende los primeros 4 compases de algo", steps: ["Elige un riff o progresión de acordes muy corto y simple", "Busca un tutorial para principiantes de eso", "Tócalo o tararéalo despacio 5 veces seguidas"] }
    ];
    const MUSIC_TASKS_FR = [
        { title: "Écoute active : un album, sans multitâche", steps: ["Choisis un album que tu n'as jamais entendu en entier", "Mets un casque, aucun autre onglet ou appli ouvert", "Remarque un instrument auquel tu ne prêtes habituellement pas attention"] },
        { title: "Apprends les 4 premières mesures de quelque chose", steps: ["Choisis un riff ou une progression d'accords très courte et simple", "Cherche un tutoriel débutant pour ça", "Joue-le ou fredonne-le lentement 5 fois de suite"] }
    ];
    const MUSIC_LEARN = [
        { label: "Beginner lessons", url: "https://www.youtube.com/results?search_query=beginner+instrument+lesson+today" },
        { label: "Music theory basics", url: "https://www.musictheory.net/lessons" }
    ];
    const MUSIC_LEARN_AR = [
        { label: "دروس للمبتدئين", url: "https://www.youtube.com/results?search_query=beginner+instrument+lesson+today" },
        { label: "أساسيات نظرية الموسيقى", url: "https://www.musictheory.net/lessons" }
    ];
    const MUSIC_LEARN_ES = [
        { label: "Lecciones para principiantes", url: "https://www.youtube.com/results?search_query=beginner+instrument+lesson+today" },
        { label: "Fundamentos de teoría musical", url: "https://www.musictheory.net/lessons" }
    ];
    const MUSIC_LEARN_FR = [
        { label: "Leçons pour débutants", url: "https://www.youtube.com/results?search_query=beginner+instrument+lesson+today" },
        { label: "Bases de la théorie musicale", url: "https://www.musictheory.net/lessons" }
    ];
    const MUSIC_READING = { title: "Listen Once Without Naming It", body: "The fastest way to stop actually hearing music is to immediately categorize it — 'that's a snare,' 'that's a ii-V-I' — before you've let the sound just land. Musicians who train their ear well do both: they analyze, but only after they've listened once with no goal except noticing how it makes them feel. Try it with the next song you play. Don't reach for your phone, don't name the chords. Just notice what happens in your chest for three minutes. The theory will still be there afterward." };
    const MUSIC_READING_AR = { title: "استمع مرة واحدة دون تسمية ما تسمعه", body: "أسرع طريقة لتتوقف عن سماع الموسيقى فعليًا هي تصنيفها فورًا — «هذا طبل سنير»، «هذا تتابع ii-V-I» — قبل أن تدع الصوت يصل إليك ببساطة. الموسيقيون الذين يدرّبون آذانهم جيدًا يفعلون الأمرين: يحلّلون، لكن فقط بعد أن يستمعوا مرة دون أي هدف سوى ملاحظة كيف يشعرهم ذلك. جرّب ذلك مع الأغنية التالية التي تشغّلها. لا تمدّ يدك لهاتفك، ولا تسمّ الأوتار. فقط لاحظ ما يحدث في صدرك لثلاث دقائق. النظرية ستظل موجودة بعد ذلك." };
    const MUSIC_READING_ES = { title: "Escucha una vez sin ponerle nombre", body: "La forma más rápida de dejar de escuchar música de verdad es categorizarla de inmediato — 'eso es una caja', 'eso es un ii-V-I' — antes de dejar que el sonido simplemente llegue. Los músicos que entrenan bien el oído hacen ambas cosas: analizan, pero solo después de haber escuchado una vez sin más meta que notar cómo les hace sentir. Pruébalo con la próxima canción que pongas. No busques tu teléfono, no nombres los acordes. Solo nota qué pasa en tu pecho durante tres minutos. La teoría seguirá ahí después." };
    const MUSIC_READING_FR = { title: "Écoute une fois sans mettre de nom dessus", body: "La façon la plus rapide d'arrêter d'entendre vraiment la musique, c'est de la catégoriser immédiatement — « ça, c'est une caisse claire », « ça, c'est un ii-V-I » — avant d'avoir laissé le son simplement arriver. Les musiciens qui entraînent bien leur oreille font les deux : ils analysent, mais seulement après avoir écouté une fois sans autre but que de remarquer ce que ça leur fait ressentir. Essaie avec la prochaine chanson que tu écoutes. Ne prends pas ton téléphone, ne nomme pas les accords. Remarque juste ce qui se passe dans ta poitrine pendant trois minutes. La théorie sera toujours là après." };

    // ---- 2.12 Travel
    const TRAVEL_PIECES = [
        { title: "Reframe your own city for a day", body: "Pick one neighborhood in your own city you've never really explored — not for a reason, just walk it like a visitor would. Notice the buildings you normally walk past without seeing. Most people have 'traveled' less in their own city than in places they've flown to." },
        { title: "The cheapest way to plan a real trip", body: "Instead of browsing endlessly, pick 3 hard constraints first — a budget ceiling, a max flight time, and a season — then search inside those constraints only. Constraints make decisions faster, not slower; unlimited options are what stall a plan for months." }
    ];
    const TRAVEL_PIECES_AR = [
        { title: "أعد اكتشاف مدينتك ليوم واحد", body: "اختر حيًا واحدًا في مدينتك لم تستكشفه فعليًا من قبل — ليس لسبب معين، فقط امشِ فيه كما يفعل زائر. لاحظ المباني التي تمر بجانبها عادة دون أن تراها. معظم الناس 'سافروا' في مدينتهم أقل مما سافروا في أماكن طاروا إليها." },
        { title: "أرخص طريقة لتخطيط رحلة حقيقية", body: "بدلًا من التصفح بلا نهاية، اختر أولًا 3 قيود صارمة — سقف ميزانية، وأقصى مدة رحلة طيران، وموسم — ثم ابحث ضمن هذه القيود فقط. القيود تجعل القرارات أسرع، لا أبطأ؛ الخيارات غير المحدودة هي ما يعطّل خطة لأشهر." }
    ];
    const TRAVEL_PIECES_ES = [
        { title: "Redescubre tu propia ciudad por un día", body: "Elige un barrio de tu propia ciudad que nunca hayas explorado de verdad — sin razón particular, solo camínalo como lo haría un visitante. Fíjate en los edificios junto a los que normalmente pasas sin verlos. La mayoría de la gente ha 'viajado' menos en su propia ciudad que en lugares a los que voló." },
        { title: "La forma más barata de planear un viaje real", body: "En vez de navegar sin fin, elige primero 3 restricciones firmes — un tope de presupuesto, una duración máxima de vuelo, y una temporada — y luego busca solo dentro de esas restricciones. Las restricciones aceleran las decisiones, no las ralentizan; las opciones ilimitadas son lo que estanca un plan durante meses." }
    ];
    const TRAVEL_PIECES_FR = [
        { title: "Redécouvre ta propre ville le temps d'une journée", body: "Choisis un quartier de ta propre ville que tu n'as jamais vraiment exploré — sans raison particulière, marche-le juste comme le ferait un visiteur. Remarque les bâtiments devant lesquels tu passes d'habitude sans les voir. La plupart des gens ont moins « voyagé » dans leur propre ville que dans les endroits où ils ont pris l'avion." },
        { title: "La façon la moins chère de planifier un vrai voyage", body: "Au lieu de naviguer sans fin, choisis d'abord 3 contraintes fermes — un plafond de budget, une durée de vol maximale, et une saison — puis cherche uniquement à l'intérieur de ces contraintes. Les contraintes accélèrent les décisions, elles ne les ralentissent pas ; ce sont les options illimitées qui bloquent un plan pendant des mois." }
    ];
    const TRAVEL_LINKS = [
        { label: "See where a flexible budget could take you", url: "https://www.google.com/travel/flights" },
        { label: "Plan a rough itinerary", url: "https://wanderlog.com/" }
    ];
    const TRAVEL_LINKS_AR = [
        { label: "اكتشف إلى أين يمكن أن تأخذك ميزانية مرنة", url: "https://www.google.com/travel/flights" },
        { label: "خطّط لمسار رحلة تقريبي", url: "https://wanderlog.com/" }
    ];
    const TRAVEL_LINKS_ES = [
        { label: "Descubre a dónde te podría llevar un presupuesto flexible", url: "https://www.google.com/travel/flights" },
        { label: "Planea un itinerario aproximado", url: "https://wanderlog.com/" }
    ];
    const TRAVEL_LINKS_FR = [
        { label: "Découvre où un budget flexible pourrait t'emmener", url: "https://www.google.com/travel/flights" },
        { label: "Planifie un itinéraire approximatif", url: "https://wanderlog.com/" }
    ];

    // ---- 2.13 Real, curated, verified videos — embedded and played on-site, never just linked out
    const EMBED_VIDEOS = {
        reading_why: { id: 'QT_XAplb4IQ', title: "Why You Can't Read Anymore (And How to Start)" },
        reading_summary: { id: 'C0Sq--g1M0o', title: "Atomic Habits in 5 Minutes — book summary" },
        reading_book_thinking: { id: 'uqXVAo7dVRU', title: "Thinking, Fast and Slow — animated book summary", time: 9 },
        reading_book_sapiens: { id: 'N0hhAfSc6tg', title: "Sapiens, Chapter 1 — read by Derek Perkins (Penguin Audiobooks)", time: 38 },
        reading_book_sapiens_video: { id: 'HitVj45O5hI', title: "Sapiens — animated book summary", time: 10 },
        reading_author_interview: { id: 'bkKtsos4D68', title: "Colson Whitehead on Harlem Shuffle — The Waterstones Interview", time: 20 },
        lang_spanish: { id: '5nzjoNItklM', title: "Spanish for Absolute Beginners" },
        lang_japanese: { id: 'FgCPc5qPCh0', title: "Japanese for Absolute Beginners" },
        lang_french: { id: 'oX1iecb5X9w', title: "French for Absolute Beginners" },
        lang_german: { id: '-f2dy4Nh4PQ', title: "German for Beginners — Part 1" },
        coding_js: { id: 'YIOT1pEk0xw', title: "JavaScript Basics in 5 Minutes" },
        fitness_mobility: { id: 'VHKtOpboEug', title: "5-Minute Daily Mobility Routine" },
        wellness_breathing: { id: '9ZGxClRyyjY', title: "5-Minute Box Breathing Exercise" },
        cooking_knife: { id: 'f2BDVR9Y-fQ', title: "5 Easy Knife Skills in 5 Minutes" },
        sports_film: { id: 'ftJr8ZTjHlM', title: "Film Study Made Simple" },
        museums_tour: { id: 'q2fBWKJL7SQ', title: "British Museum — A Virtual Walk" },
        museums_talk: { id: 'lQflBowgVB4', title: "The unheard story behind the Sistine Chapel | Elizabeth Lev" },
        music_guitar: { id: 'jh7_FRlFPw4', title: "First Guitar Lesson for Complete Beginners" },
        photo_thirds: { id: 'I1OK3yeuO_s', title: "Rule of Thirds — Ultimate Guide" },
        biz_founder: { id: 'mUuiFbJCH9M', title: "Kara Goldin: Building a Lifestyle Brand — How I Built This" },
        design_video: { id: 'UtwLbbr3nBM', title: "Don't know how to design layouts? Just do this" },
        design_audio: { id: 'cC0KxNeLp1E', title: "The hilarious art of book design | Chip Kidd" },
        wellness_video: { id: 'j7rKKpwdXNE', title: "10-Minute Yoga For Beginners | Start Yoga Here..." },
        biz_video: { id: 'vDXkpJw16os', title: "How to Get and Test Startup Ideas — Michael Seibel" },
        events_video: { id: 'YPjRcROWBpA', title: "How to Host an Unforgettable Dinner Party" },
        events_audio: { id: 'ppfONdsOkWI', title: "3 steps to turn everyday get-togethers into transformative gatherings | Priya Parker" },
        travel_video: { id: 'DS3qVi8p_e4', title: "How to Make a Travel Budget" },
        travel_audio: { id: 'OoBR3wrk1ew', title: "Where in the World is Jessica Nabongo? | Overheard at National Geographic" },
        coding_audio: { id: 'o8NPllzkFhE', title: "The Mind Behind Linux | Linus Torvalds | TED" },
        photo_audio: { id: 'H7H5LP_u81Y', title: "\"Photography lacks intentionality.\" | Paul Graham | Louisiana Channel" },
        cooking_audio: { id: '4EUAMe2ixCI', title: "Dan Barber: How I fell in love with a fish" },
        sports_audio: { id: '1Iod2IPgIqg', title: "Mike Krzyzewski on the Dan Patrick Show — Full Interview" },
        music_audio: { id: 'XfzpYcwiUrA', title: "Adele: NPR Music Tiny Desk Concert" }
    };
    const LANG_VIDEO_KEY = { Spanish: 'lang_spanish', Japanese: 'lang_japanese', French: 'lang_french', German: 'lang_german' };
    const LANG_SPEECH_CODE = { Spanish: 'es-ES', Japanese: 'ja-JP', French: 'fr-FR', German: 'de-DE' };
    const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

    // Reads a word aloud with the browser's built-in speech synthesis — real pronunciation,
    // no audio files or external service. Strips a trailing "(romanization)" hint (e.g. "木漏れ日
    // (komorebi)") before speaking, since that's for the reader's eyes, not meant to be spoken.
    function speakWord(text, langCode) {
        if (!canSpeak) return;
        const clean = text.replace(/\s*\([^)]*\)\s*$/, '');
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(clean);
        if (langCode) utter.lang = langCode;
        utter.rate = 0.9;
        window.speechSynthesis.speak(utter);
    }

    /* =========================================================
       3. ACTIVITY TEMPLATE BUILDERS — one per goal
       Each returns a pool of {title,time,type,kind,build} objects.
       `type` = preferred learning style (reading/video/audio/challenge/creative)
       `kind` = which overlay renderer to use
    ========================================================= */
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // Like pick(), but prefers items tagged for today's mood (item.moods includes mood).
    // Falls back to the full pool when nothing matches, so untagged content still works.
    function pickForMood(arr, mood) {
        if (mood) {
            const matches = arr.filter(item => item.moods && item.moods.includes(mood));
            if (matches.length) return pick(matches);
        }
        return pick(arr);
    }

    // Picks the translated version of a content array/object for the current UI language.
    // Falls back to the English base whenever a language-specific version isn't defined,
    // so partially-translated content never breaks.
    function loc(base, ar, es, fr) {
        const byLang = { ar, es, fr };
        return (currentLang !== 'en' && byLang[currentLang]) || base;
    }

    // For content items that mix translatable text (title/steps/ingredients) with fields that
    // must never change (time, servings, fn, starter code, tests): picks one index from the
    // English base array, then overlays only the fields the current-language array actually
    // defines at that same index — non-translated fields pass through from the English original.
    function pickLocalized(base, ar, es, fr) {
        const idx = Math.floor(Math.random() * base.length);
        const translated = loc(base, ar, es, fr);
        return Object.assign({}, base[idx], translated[idx]);
    }

    const TEMPLATE_BUILDERS = {
        reading: () => {
            const passages = loc(READING_PASSAGES, READING_PASSAGES_AR, READING_PASSAGES_ES, READING_PASSAGES_FR);
            const links = loc(READING_FURTHER, READING_FURTHER_AR, READING_FURTHER_ES, READING_FURTHER_FR);
            const p = pickForMood(passages, profile.mood);
            const p2 = pickForMood(passages, profile.mood);
            // Rotate between a genuine book-summary video and the reading-habit one, and among
            // three real audio pieces — so "Watching"/"Listening" a book actually varies day to
            // day instead of always resolving to the same single title.
            const watchVideo = pick([EMBED_VIDEOS.reading_why, EMBED_VIDEOS.reading_book_thinking, EMBED_VIDEOS.reading_book_sapiens_video]);
            const listenVideo = pick([EMBED_VIDEOS.reading_summary, EMBED_VIDEOS.reading_book_sapiens, EMBED_VIDEOS.reading_author_interview]);
            return [
                { title: t('content.prefixRead') + p.title, time: 6, type: 'reading', kind: 'reading', data: { passage: p, links } },
                { title: t('content.prefixWatch') + watchVideo.title, time: watchVideo.time || 8, type: 'video', kind: 'embedvideo', data: { video: watchVideo, note: t('content.videoPlaysHere') } },
                { title: t('content.prefixListen') + listenVideo.title, time: listenVideo.time || 6, type: 'audio', kind: 'embedvideo', data: { video: listenVideo, note: t('content.audioStaysPage') } },
                { title: t('content.prefixRead') + p2.title, time: 5, type: 'reading', kind: 'reading', data: { passage: p2, links } }
            ];
        },
        languages: () => {
            const sets = loc(LANGUAGE_SETS, LANGUAGE_SETS_AR, LANGUAGE_SETS_ES, LANGUAGE_SETS_FR);
            // Honors the pick from the LANGUAGE SCREEN; falls back to random only for profiles
            // saved before that screen existed (profile.language unset).
            const set = sets.find(s => s.language === profile.language) || pick(sets);
            const video = EMBED_VIDEOS[LANG_VIDEO_KEY[set.language]];
            const langName = t('language.' + set.language);
            return [
                { title: t('content.learnWords', { language: langName }), time: 6, type: 'reading', kind: 'language', data: { set } },
                { title: t('content.prefixListen') + video.title, time: 8, type: 'audio', kind: 'embedvideo', data: { video, note: t('content.listenRealSpoken', { language: langName }) } },
                { title: t('content.prefixWatch') + video.title, time: 10, type: 'video', kind: 'embedvideo', data: { video } }
            ];
        },
        design: () => {
            const tools = loc(DESIGN_TOOLS, DESIGN_TOOLS_AR, DESIGN_TOOLS_ES, DESIGN_TOOLS_FR);
            const reading = loc(DESIGN_READING, DESIGN_READING_AR, DESIGN_READING_ES, DESIGN_READING_FR);
            const brief = pickLocalized(DESIGN_BRIEFS, DESIGN_BRIEFS_AR, DESIGN_BRIEFS_ES, DESIGN_BRIEFS_FR);
            return [
                { title: t('content.prefixDesignBrief') + brief.prompt.slice(0, 46) + "…", time: 15, type: 'creative', kind: 'design', data: { brief, tools } },
                { title: t('content.buildPalette'), time: 8, type: 'challenge', kind: 'palette', data: { tools } },
                { title: t('content.studyBehance'), time: 8, type: 'challenge', kind: 'link', data: { label: t('content.behanceLabel'), url: DESIGN_TOOLS[1].url, note: t('content.behanceNote') } },
                { title: t('content.prefixRead') + reading.title, time: 5, type: 'reading', kind: 'reading', data: { passage: reading, links: tools } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.design_video.title, time: 12, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.design_video } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.design_audio.title, time: 17, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.design_audio, note: t('content.chipKiddNote') } }
            ];
        },
        coding: () => {
            const learn = loc(CODING_LEARN, CODING_LEARN_AR, CODING_LEARN_ES, CODING_LEARN_FR);
            const reading = loc(CODING_READING, CODING_READING_AR, CODING_READING_ES, CODING_READING_FR);
            const ch = pickLocalized(CODING_CHALLENGES, CODING_CHALLENGES_AR, CODING_CHALLENGES_ES, CODING_CHALLENGES_FR);
            return [
                { title: t('content.prefixCodeChallenge') + ch.title, time: 15, type: 'challenge', kind: 'coding', data: { challenge: ch, learn } },
                { title: t('content.readMdn'), time: 10, type: 'challenge', kind: 'link', data: { label: t('content.mdnLabel'), url: CODING_LEARN[1].url, note: t('content.mdnNote') } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.coding_js.title, time: 5, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.coding_js } },
                { title: t('content.prefixRead') + reading.title, time: 5, type: 'reading', kind: 'reading', data: { passage: reading, links: learn } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.coding_audio.title, time: 15, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.coding_audio, note: t('content.linusNote') } }
            ];
        },
        fitness: () => {
            // Fitness stays action-only on purpose: video (watch/follow along) and challenge (do
            // it) are actually the activity. Reading a passage or listening to a speech ABOUT
            // fitness isn't fitness — that distinction doesn't hold for most other goals, where
            // reading/listening genuinely is a way of engaging with the topic.
            const r = pickLocalized(FITNESS_ROUTINES, FITNESS_ROUTINES_AR, FITNESS_ROUTINES_ES, FITNESS_ROUTINES_FR);
            return [
                { title: r.title, time: 5, type: 'challenge', kind: 'checklist', data: { steps: r.steps } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.fitness_mobility.title, time: 5, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.fitness_mobility } }
            ];
        },
        wellness: () => {
            const learn = loc(WELLNESS_LEARN, WELLNESS_LEARN_AR, WELLNESS_LEARN_ES, WELLNESS_LEARN_FR);
            const reading = loc(WELLNESS_READING, WELLNESS_READING_AR, WELLNESS_READING_ES, WELLNESS_READING_FR);
            const r = pickLocalized(WELLNESS_ROUTINES, WELLNESS_ROUTINES_AR, WELLNESS_ROUTINES_ES, WELLNESS_ROUTINES_FR);
            return [
                { title: r.title, time: 5, type: 'challenge', kind: 'checklist', data: { steps: r.steps } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.wellness_breathing.title, time: 5, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.wellness_breathing } },
                { title: t('content.stepOutside'), time: 10, type: 'challenge', kind: 'checklist', data: { steps: [t('content.stepOutside1'), t('content.stepOutside2'), t('content.stepOutside3')] } },
                { title: t('content.prefixRead') + reading.title, time: 5, type: 'reading', kind: 'reading', data: { passage: reading, links: learn } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.wellness_video.title, time: 10, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.wellness_video } }
            ];
        },
        photography: () => {
            const learn = loc(PHOTO_LEARN, PHOTO_LEARN_AR, PHOTO_LEARN_ES, PHOTO_LEARN_FR);
            const reading = loc(PHOTO_READING, PHOTO_READING_AR, PHOTO_READING_ES, PHOTO_READING_FR);
            const prompt = pick(loc(PHOTO_PROMPTS, PHOTO_PROMPTS_AR, PHOTO_PROMPTS_ES, PHOTO_PROMPTS_FR));
            return [
                { title: t('content.prefixPhotoPrompt') + prompt, time: 6, type: 'creative', kind: 'photoprompt', data: { prompt, learn } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.photo_thirds.title, time: 5, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.photo_thirds } },
                { title: t('content.studyLighting'), time: 8, type: 'challenge', kind: 'link', data: { label: t('content.unsplashLabel'), url: PHOTO_LEARN[2].url } },
                { title: t('content.prefixRead') + reading.title, time: 5, type: 'reading', kind: 'reading', data: { passage: reading, links: learn } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.photo_audio.title, time: 28, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.photo_audio, note: t('content.paulGrahamNote') } }
            ];
        },
        cooking: () => {
            const learn = loc(COOKING_LEARN, COOKING_LEARN_AR, COOKING_LEARN_ES, COOKING_LEARN_FR);
            const reading = loc(COOKING_READING, COOKING_READING_AR, COOKING_READING_ES, COOKING_READING_FR);
            const r = pickLocalized(RECIPES, RECIPES_AR, RECIPES_ES, RECIPES_FR);
            return [
                { title: t('content.prefixCook') + r.title, time: r.time, type: 'creative', kind: 'recipe', data: { recipe: r } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.cooking_knife.title, time: 5, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.cooking_knife } },
                { title: t('content.prepIngredient'), time: 8, type: 'challenge', kind: 'checklist', data: { steps: [t('content.prepSteps1'), t('content.prepSteps2'), t('content.prepSteps3')] } },
                { title: t('content.prefixRead') + reading.title, time: 5, type: 'reading', kind: 'reading', data: { passage: reading, links: learn } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.cooking_audio.title, time: 18, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.cooking_audio, note: t('content.danBarberNote') } }
            ];
        },
        entrepreneurship: () => {
            const learn = loc(BUSINESS_LEARN, BUSINESS_LEARN_AR, BUSINESS_LEARN_ES, BUSINESS_LEARN_FR);
            const reading = loc(BIZ_READING, BIZ_READING_AR, BIZ_READING_ES, BIZ_READING_FR);
            const task = pickLocalized(BUSINESS_TASKS, BUSINESS_TASKS_AR, BUSINESS_TASKS_ES, BUSINESS_TASKS_FR);
            return [
                { title: task.title, time: 8, type: 'challenge', kind: 'checklist', data: { steps: task.steps, learn } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.biz_founder.title, time: 10, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.biz_founder } },
                { title: t('content.sketchCanvas'), time: 15, type: 'creative', kind: 'link', data: { label: t('content.canvasLabel'), url: BUSINESS_LEARN[1].url } },
                { title: t('content.prefixRead') + reading.title, time: 5, type: 'reading', kind: 'reading', data: { passage: reading, links: learn } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.biz_video.title, time: 6, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.biz_video } }
            ];
        },
        sports: () => {
            const learn = loc(SPORTS_LEARN, SPORTS_LEARN_AR, SPORTS_LEARN_ES, SPORTS_LEARN_FR);
            const reading = loc(SPORTS_READING, SPORTS_READING_AR, SPORTS_READING_ES, SPORTS_READING_FR);
            const d = pickLocalized(SPORTS_DRILLS, SPORTS_DRILLS_AR, SPORTS_DRILLS_ES, SPORTS_DRILLS_FR);
            return [
                { title: d.title, time: 5, type: 'challenge', kind: 'checklist', data: { steps: d.steps } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.sports_film.title, time: 8, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.sports_film } },
                { title: t('content.prefixRead') + reading.title, time: 5, type: 'reading', kind: 'reading', data: { passage: reading, links: learn } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.sports_audio.title, time: 19, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.sports_audio, note: t('content.sportsAudioNote') } }
            ];
        },
        museums: () => {
            const links = loc(CULTURE_LINKS, CULTURE_LINKS_AR, CULTURE_LINKS_ES, CULTURE_LINKS_FR);
            const c = pick(loc(CULTURE_PIECES, CULTURE_PIECES_AR, CULTURE_PIECES_ES, CULTURE_PIECES_FR));
            return [
                { title: c.title, time: 6, type: 'reading', kind: 'culture', data: { piece: c, links } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.museums_tour.title, time: 9, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.museums_tour } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.museums_talk.title, time: 18, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.museums_talk, note: t('content.museumsTalkNote') } }
            ];
        },
        events: () => {
            const links = loc(EVENTS_LINKS, EVENTS_LINKS_AR, EVENTS_LINKS_ES, EVENTS_LINKS_FR);
            const reading = loc(EVENTS_READING, EVENTS_READING_AR, EVENTS_READING_ES, EVENTS_READING_FR);
            const task = pickLocalized(EVENTS_TASKS, EVENTS_TASKS_AR, EVENTS_TASKS_ES, EVENTS_TASKS_FR);
            return [
                { title: task.title, time: 8, type: 'challenge', kind: 'checklist', data: { steps: task.steps, learn: links } },
                { title: t('content.browseEvents'), time: 6, type: 'challenge', kind: 'link', data: { label: t('content.eventListingsLabel'), url: EVENTS_LINKS[0].url } },
                { title: t('content.prefixRead') + reading.title, time: 5, type: 'reading', kind: 'reading', data: { passage: reading, links } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.events_video.title, time: 4, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.events_video } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.events_audio.title, time: 12, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.events_audio, note: t('content.priyaParkerNote') } }
            ];
        },
        music: () => {
            const learn = loc(MUSIC_LEARN, MUSIC_LEARN_AR, MUSIC_LEARN_ES, MUSIC_LEARN_FR);
            const reading = loc(MUSIC_READING, MUSIC_READING_AR, MUSIC_READING_ES, MUSIC_READING_FR);
            const task = pickLocalized(MUSIC_TASKS, MUSIC_TASKS_AR, MUSIC_TASKS_ES, MUSIC_TASKS_FR);
            return [
                { title: task.title, time: 10, type: 'challenge', kind: 'checklist', data: { steps: task.steps, learn } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.music_guitar.title, time: 8, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.music_guitar } },
                { title: t('content.learnTheory'), time: 8, type: 'challenge', kind: 'link', data: { label: t('content.theoryLabel'), url: MUSIC_LEARN[1].url } },
                { title: t('content.prefixRead') + reading.title, time: 5, type: 'reading', kind: 'reading', data: { passage: reading, links: learn } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.music_audio.title, time: 15, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.music_audio, note: t('content.tinyDeskNote') } }
            ];
        },
        travel: () => {
            const links = loc(TRAVEL_LINKS, TRAVEL_LINKS_AR, TRAVEL_LINKS_ES, TRAVEL_LINKS_FR);
            const p = pick(loc(TRAVEL_PIECES, TRAVEL_PIECES_AR, TRAVEL_PIECES_ES, TRAVEL_PIECES_FR));
            return [
                { title: p.title, time: 6, type: 'reading', kind: 'culture', data: { piece: p, links } },
                { title: t('content.seeBudget'), time: 8, type: 'challenge', kind: 'link', data: { label: t('content.flightsLabel'), url: TRAVEL_LINKS[0].url } },
                { title: t('content.sketchItinerary'), time: 15, type: 'creative', kind: 'link', data: { label: t('content.itineraryLabel'), url: TRAVEL_LINKS[1].url } },
                { title: t('content.prefixWatch') + EMBED_VIDEOS.travel_video.title, time: 5, type: 'video', kind: 'embedvideo', data: { video: EMBED_VIDEOS.travel_video } },
                { title: t('content.prefixListen') + EMBED_VIDEOS.travel_audio.title, time: 24, type: 'audio', kind: 'embedvideo', data: { video: EMBED_VIDEOS.travel_audio, note: t('content.natGeoNote') } }
            ];
        }
    };

    /* =========================================================
       4. STATE
    ========================================================= */
    function defaultProfile() { return { goals: [], time: 15, style: 'reading', mood: 'calm', language: null }; }
    function defaultStats() {
        return {
            goalStats: Object.fromEntries(Object.keys(GOAL_META).map(g => [g, { shown: 0, completed: 0 }])),
            totalCompleted: 0,
            daysActive: [],
            history: [],
            badges: [],
            recentTitles: [],
            lastProfile: null,
            dayNotes: {} // { [isoDate]: text } — the free-text note from the path screen, keyed by day
        };
    }
    function defaultIdentity() { return { signedIn: false, method: null, name: '', avatar: '', email: '', photo: '', uid: '' }; }

    let profile = defaultProfile();
    let stats = defaultStats();
    let identity = defaultIdentity();
    let todaysPath = [];
    let deprioritizedGoal = null;
    let profileReturnTo = 'welcome';
    let pendingAfterSignIn = null; // action to resume automatically right after a gated sign-in completes
    let audioEnabled = false; // whether the mood ambience should be audible — see AMBIENT MOOD AUDIO below
    let theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
    let overlayActiveIndex = null;
    let avatarPickerExpanded = false; // UI-only — whether the "+N more" emoji avatars are shown
    let pickedIdentity = null; // which IDENTITY_META entry step 1 picked — drives step 3's subject choices

    function todayISO() { return new Date().toISOString().slice(0, 10); }
    function currentScreenId() {
        const active = document.querySelector('.screen.active');
        return active ? active.id.replace('screen-', '') : 'welcome';
    }

    /* =========================================================
       5. PERSISTENCE
    ========================================================= */
    async function saveState() {
        // No passwords or credentials in here — Firebase Authentication owns those entirely.
        // `identity` is just a local cache of the signed-in Firebase user's display info
        // (name/email/avatar/photo/uid), used to paint the UI instantly on load.
        const payload = JSON.stringify({ stats, lastProfile: profile, identity, lang: currentLang, audioEnabled, theme });
        if (hasWindowStorage) {
            try { await window.storage.set('bloom-state', payload, false); }
            catch (e) { console.error('Lumen: window.storage save failed', e); }
        }
        if (hasLocalStorage) {
            try { localStorage.setItem('bloom-state', payload); }
            catch (e) { console.error('Lumen: localStorage save failed', e); }
        }
    }
    async function loadState() {
        let raw = null;
        if (hasWindowStorage) {
            try { const res = await window.storage.get('bloom-state', false); if (res && res.value) raw = res.value; }
            catch (e) { /* nothing saved there yet */ }
        }
        if (!raw && hasLocalStorage) {
            try { raw = localStorage.getItem('bloom-state'); } catch (e) { /* ignore */ }
        }
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw);
            stats = Object.assign(defaultStats(), parsed.stats);
            if (!stats.goalStats) stats.goalStats = defaultStats().goalStats;
            if (!stats.badges) stats.badges = [];
            if (!stats.recentTitles) stats.recentTitles = [];
            if (!stats.dayNotes) stats.dayNotes = {};
            Object.keys(GOAL_META).forEach(g => { if (!stats.goalStats[g]) stats.goalStats[g] = { shown: 0, completed: 0 }; });
            if (parsed.lastProfile) profile = Object.assign(defaultProfile(), parsed.lastProfile);
            if (parsed.identity) identity = Object.assign(defaultIdentity(), parsed.identity);
            if (parsed.lang && LANGUAGES[parsed.lang]) currentLang = parsed.lang;
            if (typeof parsed.audioEnabled === 'boolean') audioEnabled = parsed.audioEnabled;
            if (parsed.theme === 'light' || parsed.theme === 'dark') theme = parsed.theme;
            updateProfileBtnDisplay();
            updateStreakChip();
        } catch (e) { /* saved data was corrupt or unreadable — start fresh rather than crash */ }
    }

    /* =========================================================
       6. LOGO INJECTION
    ========================================================= */
    function injectLogos() {
        ['brandLogoSlot', 'welcomeLogoSlot', 'completionLogoSlot', 'footerLogoSlot', 'profileLogoSlot'].forEach(id => {
            const slot = document.getElementById(id);
            if (!slot) return;
            const img = document.createElement('img');
            img.src = 'assets/images/logo.png';
            img.alt = 'Lumen';
            slot.appendChild(img);
        });
    }

    /* =========================================================
       7. SCREEN NAVIGATION
    ========================================================= */
    const dotsEl = document.getElementById('progressDots');
    const SCREEN_LABEL_KEY = { goals: 'goals.heading', time: 'time.heading', subject: 'subject.heading', language: 'langStep.heading', style: 'style.heading', mood: 'mood.heading', path: 'path.heading', completion: 'completion.headingDefault' };
    ONBOARD_SCREENS.forEach((screenId) => {
        const d = document.createElement('button');
        d.type = 'button';
        d.className = 'dot';
        d.dataset.screenId = screenId;
        dotsEl.appendChild(d);
    });
    const dots = dotsEl.querySelectorAll('.dot');
    // Re-applies each dot's screen-reader label in the current language — called from
    // applyLanguage() too, since these buttons are only created once at load.
    function refreshDotLabels() {
        dots.forEach(d => d.setAttribute('aria-label', t('overlay.goToStep', { step: t(SCREEN_LABEL_KEY[d.dataset.screenId]) })));
    }
    refreshDotLabels();

    // Re-renders and shows a given ONBOARD_SCREENS step — used by both the back-icon buttons
    // (always one step back) and the progress dots (jump straight to any already-reached step).
    function navigateToOnboardStep(idx) {
        const screenId = ONBOARD_SCREENS[idx];
        if (screenId === 'goals') renderGoalsGrid();
        else if (screenId === 'time') renderTimeScreen();
        else if (screenId === 'subject') renderSubjectGrid();
        else if (screenId === 'language') renderLanguageGrid();
        else if (screenId === 'style') renderStyleGrid();
        else if (screenId === 'mood') renderMoodGrid();
        else if (screenId === 'path') renderPathList();
        showScreen(screenId);
    }

    // Style/mood are step 4/5 normally, but bump to 5/6 whenever the language screen is
    // actually part of this run (subject === 'languages') — called from renderStyleGrid /
    // renderMoodGrid on every render so the number stays right if the subject changes.
    function setStepEyebrow(screenId, n) {
        const el = document.querySelector('#screen-' + screenId + ' .eyebrow[data-step]');
        if (!el) return;
        el.dataset.step = n;
        el.textContent = t('step.prefix') + ' ' + n;
    }

    dotsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.dot');
        if (!btn || !btn.classList.contains('reachable')) return;
        navigateToOnboardStep(Array.from(dots).indexOf(btn));
    });

    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen-' + id).classList.add('active');
        const idx = ONBOARD_SCREENS.indexOf(id);
        dotsEl.style.display = idx === -1 ? 'none' : 'flex';
        dots.forEach((d, i) => {
            d.classList.toggle('current', i === idx);
            d.classList.toggle('done', idx !== -1 && i < idx);
            d.classList.toggle('reachable', idx !== -1 && i <= idx);
        });

        const navMap = {
            welcome: 'navHome', progress: 'navGrowth',
            goals: 'navRestart', time: 'navRestart', subject: 'navRestart', language: 'navRestart', style: 'navRestart', mood: 'navRestart', path: 'navRestart', completion: 'navRestart'
        };
        const activeNavId = navMap[id];
        ['navHome', 'navGrowth', 'navRestart'].forEach(navId => {
            const el = document.getElementById(navId);
            const isActive = navId === activeNavId;
            el.classList.toggle('nav-active', isActive);
            if (isActive) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
        });

        window.scrollTo({ top: 0, behavior: 'auto' });
    }

    document.getElementById('brandHome').addEventListener('click', () => { requireSignIn(() => showScreen('welcome')); });
    document.getElementById('navHome').addEventListener('click', () => { requireSignIn(() => showScreen('welcome')); });
    document.getElementById('navGrowth').addEventListener('click', () => {
        requireSignIn(() => { renderProgress(); showScreen('progress'); });
    });
    document.getElementById('navRestart').addEventListener('click', () => { requireSignIn(() => goToGoals()); });

    document.getElementById('profileBtn').addEventListener('click', () => {
        profileReturnTo = currentScreenId();
        renderProfileScreen();
        showScreen('profile');
    });
    document.getElementById('profileDoneBtn').addEventListener('click', () => { showScreen(profileReturnTo || 'welcome'); });

    // A free profile is required to build or save a path — this runs `action` immediately
    // if already signed in, or opens the profile screen and holds `action` to resume the
    // instant sign-in succeeds (Google or the email form), so signing in never dead-ends
    // on a blank profile page when the person was actually trying to do something else.
    function requireSignIn(action) {
        if (identity.signedIn) { action(); return; }
        pendingAfterSignIn = action;
        profileReturnTo = 'welcome';
        renderProfileScreen();
        showScreen('profile');
    }

    // goToGoals({reset:true}) always starts the picker empty — used by the homepage's
    // "Start Building", so a fresh visit never shows picks left over from earlier in the
    // session. Plain goToGoals() keeps whatever was already picked — used by the nav's
    // "Build a Path" and "Build another day", a shortcut for a returning user who's likely
    // building on the same goal as last time.
    function goToGoals(opts) {
        if (opts && opts.reset) { profile.goals = []; pickedIdentity = null; }
        renderGoalsGrid();
        showScreen('goals');
    }
    document.getElementById('startBtn').addEventListener('click', () => {
        requireSignIn(() => goToGoals({ reset: true }));
    });

    /* =========================================================
       8. GOALS SCREEN
       Asks "who do you want to become," not "what subject do you
       want" — so this picks a broad IDENTITY_META entry (which real
       subject it maps to is narrowed down next, in the SUBJECT
       SCREEN below). Single-select: picking an identity replaces
       whichever was picked before, tracked in `pickedIdentity` — not
       in profile.goals, which stays empty until step 3 narrows it
       to one real subject. Click handling is delegated to the grid
       itself, bound once below, and every card's visual state is
       re-derived straight from `pickedIdentity` on every click.
    ========================================================= */
    const goalsGrid = document.getElementById('goalsGrid');
    const goalsNext = document.getElementById('goalsNext');
    function renderGoalsGrid() {
        goalsGrid.innerHTML = Object.keys(IDENTITY_META).map(id => {
            const m = IDENTITY_META[id];
            const selected = pickedIdentity === id;
            const includeTags = m.goals.map(g => `<span class="identity-tag">${t('goal.' + g + '.label')}</span>`).join('');
            return `<div class="option-card ${selected ? 'selected' : ''}" data-identity="${id}" style="--goal-color:${m.color}">
      <div class="opt-icon">${m.icon}</div>
      <div class="opt-label">${t('identity.' + id + '.label')}</div>
      <div class="opt-desc">${t('identity.' + id + '.tagline')}</div>
      <div class="identity-tags">${includeTags}</div>
    </div>`;
        }).join('');
        goalsNext.disabled = !pickedIdentity;
    }
    goalsGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.option-card');
        if (!card) return;
        const id = card.dataset.identity;
        if (!id) return;
        if (pickedIdentity !== id) profile.goals = []; // switching identity clears any subject picked under the old one
        pickedIdentity = id; // picking a new one replaces the previous pick
        goalsGrid.querySelectorAll('.option-card').forEach(c => {
            c.classList.toggle('selected', c.dataset.identity === id);
        });
        goalsNext.disabled = false;
    });
    goalsNext.addEventListener('click', () => { renderTimeScreen(); showScreen('time'); });
    document.getElementById('goalsBackBtn').addEventListener('click', () => { requireSignIn(() => showScreen('welcome')); });

    /* =========================================================
       9. TIME SCREEN
    ========================================================= */
    const timeSlider = document.getElementById('timeSlider');
    const timeValueNum = document.getElementById('timeValueNum');
    const timePresets = document.getElementById('timePresets');

    function renderTimeScreen() {
        timeSlider.value = profile.time;
        timeValueNum.textContent = profile.time;
        updateSliderFill();
        timePresets.innerHTML = TIME_PRESETS.map(mins => `<button class="chip ${profile.time === mins ? 'selected' : ''}" data-preset="${mins}">${mins} ${t('time.unit')}</button>`).join('');
    }
    function updateSliderFill() {
        const pct = ((timeSlider.value - timeSlider.min) / (timeSlider.max - timeSlider.min)) * 100;
        timeSlider.style.setProperty('--fill', pct + '%');
    }
    timeSlider.addEventListener('input', () => {
        profile.time = parseInt(timeSlider.value, 10);
        timeValueNum.textContent = profile.time;
        updateSliderFill();
        timePresets.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', parseInt(c.dataset.preset, 10) === profile.time));
    });
    timePresets.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip');
        if (!chip) return;
        profile.time = parseInt(chip.dataset.preset, 10);
        timeSlider.value = profile.time;
        timeValueNum.textContent = profile.time;
        updateSliderFill();
        timePresets.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', parseInt(c.dataset.preset, 10) === profile.time));
    });
    document.getElementById('timeNext').addEventListener('click', () => { renderSubjectGrid(); showScreen('subject'); });
    document.getElementById('timeBackBtn').addEventListener('click', () => navigateToOnboardStep(ONBOARD_SCREENS.indexOf('goals')));

    /* =========================================================
       9.5. SUBJECT SCREEN
       Step 1 picks a broad identity (e.g. "Lifelong Learner"); this
       narrows it down to one real subject inside that identity (e.g.
       Reading vs. Languages vs. Museums & Art) — single-select, same
       card pattern as the old subject-only goals screen. profile.goals
       ends up holding exactly that one subject, so the style screen
       right after this can show ONLY formats that subject actually has.
    ========================================================= */
    const subjectGrid = document.getElementById('subjectGrid');
    const subjectNext = document.getElementById('subjectNext');
    function renderSubjectGrid() {
        const idm = IDENTITY_META[pickedIdentity];
        document.getElementById('subjectScreenSub').textContent =
            t('subject.subDynamic', { identity: t('identity.' + pickedIdentity + '.label') });
        // a single-subject identity (e.g. Calm Mind) has only one real choice — preselect it
        // rather than leaving Continue blocked on an inevitable pick.
        if (idm.goals.length === 1 && profile.goals[0] !== idm.goals[0]) profile.goals = idm.goals.slice();

        subjectGrid.innerHTML = idm.goals.map(g => {
            const m = GOAL_META[g];
            const selected = profile.goals.length === 1 && profile.goals[0] === g;
            return `<div class="option-card ${selected ? 'selected' : ''}" data-goal="${g}" style="--goal-color:${m.color}">
      <div class="opt-icon">${m.icon}</div>
      <div class="opt-label">${t('goal.' + g + '.label')}</div>
      <div class="opt-desc">${t('goal.' + g + '.desc')}</div>
    </div>`;
        }).join('');
        subjectNext.disabled = profile.goals.length !== 1 || !idm.goals.includes(profile.goals[0]);
    }
    subjectGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.option-card');
        if (!card) return;
        const g = card.dataset.goal;
        if (!g) return;
        profile.goals = [g]; // single-select — picking a new one replaces the previous pick
        subjectGrid.querySelectorAll('.option-card').forEach(c => c.classList.toggle('selected', c.dataset.goal === g));
        subjectNext.disabled = false;
    });
    // Only the 'languages' subject has anything for the language screen to narrow down —
    // everyone else skips straight to style, same as before this step existed.
    subjectNext.addEventListener('click', () => {
        if (profile.goals[0] === 'languages') { renderLanguageGrid(); showScreen('language'); }
        else { renderStyleGrid(); showScreen('style'); }
    });
    document.getElementById('subjectBackBtn').addEventListener('click', () => navigateToOnboardStep(ONBOARD_SCREENS.indexOf('time')));

    /* =========================================================
       9.6. LANGUAGE SCREEN (only reached when subject === 'languages')
       Picks which of the real vocab sets (see LANGUAGE_SETS, section
       2.2) today's "Languages" path draws from — the languages
       template builder used to `pick()` one at random on every call;
       now it prefers profile.language when set. Step number is 4
       here, and it bumps style/mood to 5/6 for this path only —
       every other subject's style/mood screens stay 4/5, untouched.
    ========================================================= */
    const languageGrid = document.getElementById('languageGrid');
    const languageNext = document.getElementById('languageNext');
    function renderLanguageGrid() {
        const sets = loc(LANGUAGE_SETS, LANGUAGE_SETS_AR, LANGUAGE_SETS_ES, LANGUAGE_SETS_FR);
        languageGrid.innerHTML = sets.map(set => {
            const sample = set.words[0];
            return `<div class="option-card ${profile.language === set.language ? 'selected' : ''}" data-language="${set.language}">
      <div class="opt-icon">${LANGUAGE_META[set.language].icon}</div>
      <div class="opt-label">${t('language.' + set.language)}</div>
      <div class="opt-desc">${sample.word} — ${sample.translation}</div>
    </div>`;
        }).join('');
        languageNext.disabled = !profile.language;
    }
    languageGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.option-card');
        if (!card) return;
        const l = card.dataset.language;
        if (!l) return;
        profile.language = l;
        languageGrid.querySelectorAll('.option-card').forEach(c => c.classList.toggle('selected', c.dataset.language === l));
        languageNext.disabled = false;
    });
    languageNext.addEventListener('click', () => { renderStyleGrid(); showScreen('style'); });
    document.getElementById('languageBackBtn').addEventListener('click', () => navigateToOnboardStep(ONBOARD_SCREENS.indexOf('subject')));

    /* =========================================================
       10. STYLE SCREEN
       Step 3 already narrowed profile.goals down to exactly one real
       subject, so this only ever shows formats that subject actually
       has real content for — no dead "doesn't apply" cards. Every
       card names real activity titles from that subject (e.g. "Build
       a 5-color palette and name each role") instead of a static blurb.
    ========================================================= */
    const styleGrid = document.getElementById('styleGrid');
    const styleNext = document.getElementById('styleNext');

    // { styleId: [{goal, title}, ...] } — every real template the picked subject has that
    // would surface under this format.
    function styleRelevanceMap() {
        const map = {};
        STYLE_OPTIONS.forEach(s => map[s.id] = []);
        profile.goals.forEach(g => {
            let templates;
            try { templates = TEMPLATE_BUILDERS[g] ? TEMPLATE_BUILDERS[g]() : []; }
            catch (e) { templates = []; }
            templates.forEach(t => { if (map[t.type]) map[t.type].push({ goal: g, title: t.title }); });
        });
        return map;
    }
    // Strip the generic "Watch: " / "Read: " / etc. prefix so the style card doesn't say
    // "Watching: Watch: ..." — the format is already named by the card itself.
    function cleanActivityTitle(title) {
        const prefixes = [
            t('content.prefixWatch'), t('content.prefixListen'), t('content.prefixRead'), t('content.prefixCook'),
            t('content.prefixCodeChallenge'), t('content.prefixPhotoPrompt'), t('content.prefixDesignBrief')
        ];
        let clean = title;
        for (const p of prefixes) {
            if (clean.startsWith(p)) { clean = clean.slice(p.length); break; }
        }
        if (clean.length > 46) clean = clean.slice(0, 43).trim() + '…';
        return clean;
    }
    function styleFitDescription(matches) {
        const titles = matches.slice(0, 2).map(m => cleanActivityTitle(m.title));
        const extra = matches.length - titles.length;
        return titles.join('  ·  ') + (extra > 0 ? '  ' + t('overlay.moreCount', { n: extra }) : '');
    }
    function renderStyleGrid() {
        setStepEyebrow('style', profile.goals[0] === 'languages' ? 5 : 4);
        const relevance = styleRelevanceMap();
        const ordered = STYLE_OPTIONS
            .filter(s => relevance[s.id].length > 0)
            .sort((a, b) => relevance[b.id].length - relevance[a.id].length);
        if (!ordered.some(s => s.id === profile.style)) profile.style = null; // stale pick from a different subject
        const currentGoal = profile.goals[0];
        styleGrid.innerHTML = ordered.map(s => `
    <div class="option-card ${profile.style === s.id ? 'selected' : ''}" data-style="${s.id}">
      <div class="opt-icon">${s.icon}</div>
      <div class="opt-label">${t('goalStyle.' + currentGoal + '.' + s.id)}</div>
      <div class="opt-desc">${styleFitDescription(relevance[s.id])}</div>
    </div>`).join('');
        styleNext.disabled = !profile.style;
    }
    styleGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.option-card');
        if (!card) return;
        const s = card.dataset.style;
        if (!s) return;
        profile.style = s;
        styleGrid.querySelectorAll('.option-card').forEach(c => c.classList.toggle('selected', c.dataset.style === s));
        styleNext.disabled = false;
    });
    styleNext.addEventListener('click', () => { renderMoodGrid(); showScreen('mood'); });
    // Back goes to whichever screen actually preceded style for this run: the language
    // screen if this is the 'languages' subject, otherwise straight back to subject.
    document.getElementById('styleBackBtn').addEventListener('click', () => navigateToOnboardStep(ONBOARD_SCREENS.indexOf(profile.goals[0] === 'languages' ? 'language' : 'subject')));

    /* =========================================================
       11. MOOD SCREEN
    ========================================================= */
    const moodGrid = document.getElementById('moodGrid');
    const moodNext = document.getElementById('moodNext');
    function renderMoodGrid() {
        setStepEyebrow('mood', profile.goals[0] === 'languages' ? 6 : 5);
        moodGrid.innerHTML = Object.keys(MOOD_META).map(m => {
            const meta = MOOD_META[m];
            return `<div class="option-card ${profile.mood === m ? 'selected' : ''}" data-mood-opt="${m}">
      <div class="opt-icon">${meta.icon}</div>
      <div class="opt-label">${t('moodOpt.' + m + '.label')}</div>
    </div>`;
        }).join('');
        if (profile.mood) document.body.setAttribute('data-mood', profile.mood);
        moodNext.disabled = !profile.mood;
    }
    moodGrid.addEventListener('click', (e) => {
        const card = e.target.closest('.option-card');
        if (!card) return;
        const m = card.dataset.moodOpt;
        if (!m) return;
        setMood(m);
        moodGrid.querySelectorAll('.option-card').forEach(c => c.classList.toggle('selected', c.dataset.moodOpt === m));
        moodNext.disabled = false;
    });
    moodNext.addEventListener('click', async () => {
        await buildAndShowPath();
        showScreen('path');
    });
    document.getElementById('moodBackBtn').addEventListener('click', () => navigateToOnboardStep(ONBOARD_SCREENS.indexOf('style')));
    document.getElementById('pathBackBtn').addEventListener('click', () => navigateToOnboardStep(ONBOARD_SCREENS.indexOf('mood')));

    /* =========================================================
       11.5. AMBIENT MOOD AUDIO
       Lazily creates a single AudioContext on first use (browsers
       block audio before a user gesture, so this only ever runs
       from the toggle button's click handler or the one-time
       gesture listener armed at init when audio was left on last
       visit). crossfadeMoodAmbience() overlaps a fade-out of the
       old mood's nodes with a fade-in of the new one's, called from
       setMood() — the single place mood already changes from.
    ========================================================= */
    let audioCtx = null;
    let currentMoodNodes = null; // pad: { mode, oscs:[], gain, lfo, bellTimer } / arp: { mode, timer, stopped }

    function ensureAudioContext() {
        if (audioCtx) return audioCtx;
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
        return audioCtx;
    }

    function stopMoodAmbience(fadeSec) {
        if (!currentMoodNodes || !audioCtx) return;
        if (currentMoodNodes.mode === 'arp') {
            currentMoodNodes.stopped = true;
            clearTimeout(currentMoodNodes.timer);
        } else {
            const { oscs, gain, lfo, bellTimer } = currentMoodNodes;
            const now = audioCtx.currentTime;
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(gain.gain.value, now);
            gain.gain.linearRampToValueAtTime(0, now + fadeSec);
            oscs.forEach(o => o.stop(now + fadeSec + 0.05));
            lfo.stop(now + fadeSec + 0.05);
            clearInterval(bellTimer);
        }
        currentMoodNodes = null;
    }

    // A single soft, long-decaying sine "ping" — a meditation-bowl-style bell, not a chime —
    // used to punctuate the calm/stressed pads every so often instead of leaving them static.
    function playMoodBell(ctx, freq, peakGain) {
        const now = ctx.currentTime;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(peakGain, now + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(now);
        o.stop(now + 3.6);
    }

    // 'pad' — a slow sustained chord for calm/tired/stressed, breathing gently via a soft LFO
    // on the filter cutoff, optionally punctuated by playMoodBell() for a meditative feel.
    function startPad(ctx, recipe) {
        const now = ctx.currentTime;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = recipe.filterHz;

        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.linearRampToValueAtTime(recipe.gain, now + 1.5);
        filter.connect(gain);
        gain.connect(ctx.destination);

        const oscs = recipe.freqs.map((f, i) => {
            const o = ctx.createOscillator();
            o.type = recipe.type;
            o.frequency.value = f;
            o.detune.value = (i - (recipe.freqs.length - 1) / 2) * 3; // slight spread for warmth, not a chorus effect
            o.connect(filter);
            o.start(now);
            return o;
        });

        const lfo = ctx.createOscillator();
        lfo.frequency.value = recipe.lfoHz;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = recipe.lfoDepth;
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);
        lfo.start(now);

        let bellTimer = null;
        if (recipe.bellFreq) {
            bellTimer = setInterval(() => playMoodBell(ctx, recipe.bellFreq, recipe.gain * 1.8), recipe.bellEvery * 1000);
        }

        currentMoodNodes = { mode: 'pad', oscs, gain, lfo, bellTimer };
    }

    // 'arp' — a loop of single plucked notes for energized/creative: actual melodic movement
    // instead of a held chord, so it reads as music rather than a drone. Timing is a plain
    // setTimeout chain, not sample-accurate Web Audio scheduling — plenty tight for background
    // ambience and far simpler.
    function startArp(ctx, recipe) {
        const state = { mode: 'arp', timer: null, stopped: false };
        let i = 0;
        function playNote() {
            if (state.stopped) return;
            const now = ctx.currentTime;
            const o = ctx.createOscillator();
            o.type = recipe.type;
            o.frequency.value = recipe.notes[i % recipe.notes.length];
            i++;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = recipe.filterHz;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, now);
            g.gain.linearRampToValueAtTime(recipe.gain, now + 0.02);
            g.gain.exponentialRampToValueAtTime(0.0001, now + recipe.tempo * 1.9);
            o.connect(filter);
            filter.connect(g);
            g.connect(ctx.destination);
            o.start(now);
            o.stop(now + recipe.tempo * 2);
            state.timer = setTimeout(playNote, recipe.tempo * 1000);
        }
        playNote();
        currentMoodNodes = state;
    }

    function startMoodAmbience(mood) {
        const ctx = ensureAudioContext();
        if (!ctx) return;
        const table = theme === 'light' ? MOOD_AUDIO_RECIPE_LIGHT : MOOD_AUDIO_RECIPE;
        const recipe = table[mood] || table.calm;
        if (recipe.mode === 'arp') startArp(ctx, recipe);
        else startPad(ctx, recipe);
    }

    function crossfadeMoodAmbience(mood) {
        if (!audioEnabled) return;
        if (currentMoodNodes) stopMoodAmbience(0.8);
        startMoodAmbience(mood);
    }

    // Speaker glyph shared by both states — only the tip (sound waves vs. an X) changes, same
    // stroke-icon language as the rest of the app (eye/back-arrow/feature icons: 24x24 viewBox,
    // currentColor stroke, no fill) rather than an emoji.
    const ICON_SPEAKER_BODY = '<path d="M3 9v6h4l5 5V4L7 9H3z" stroke-linecap="round" stroke-linejoin="round"/>';
    const ICON_AUDIO_ON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${ICON_SPEAKER_BODY}<path d="M15.5 8.5a5 5 0 0 1 0 7" stroke-linecap="round"/><path d="M18.6 5.4a9 9 0 0 1 0 13.2" stroke-linecap="round"/></svg>`;
    const ICON_AUDIO_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${ICON_SPEAKER_BODY}<path d="M16 9l6 6M22 9l-6 6" stroke-linecap="round"/></svg>`;

    function setAudioToggleUI() {
        const btn = document.getElementById('audioToggleBtn');
        if (!btn) return;
        btn.innerHTML = audioEnabled ? ICON_AUDIO_ON : ICON_AUDIO_OFF;
        btn.setAttribute('aria-pressed', audioEnabled ? 'true' : 'false');
        const label = t(audioEnabled ? 'nav.audioOn' : 'nav.audioOff');
        btn.setAttribute('aria-label', label);
        btn.title = label;
    }

    function toggleMoodAudio() {
        audioEnabled = !audioEnabled;
        if (audioEnabled) {
            const ctx = ensureAudioContext();
            if (ctx && ctx.state === 'suspended') ctx.resume();
            startMoodAmbience(profile.mood || 'calm');
        } else {
            stopMoodAmbience(0.6);
        }
        setAudioToggleUI();
        saveState();
    }
    document.getElementById('audioToggleBtn').addEventListener('click', toggleMoodAudio);

    /* =========================================================
       11.6. LIGHT / DARK MODE
       Doesn't touch a single mood/brand color — data-theme just controls how much white
       or black gets mixed into those colors in CSS (see style.css). The one thing this
       layer does own is re-picking the mood ambience's audio recipe: MOOD_AUDIO_RECIPE_LIGHT
       is a brighter, higher-pitched take on the same mood sounds, so flipping the toggle
       while audio is on crossfades to a sound that actually fits daylight vs. night.
    ========================================================= */
    // Same stroke-icon language as the audio glyphs above — a crescent moon while dark is
    // active (tapping switches to light), a sun while light is active (taps switch to dark).
    const ICON_THEME_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const ICON_THEME_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" stroke-linecap="round"/></svg>';

    function setThemeToggleUI() {
        const btn = document.getElementById('themeToggleBtn');
        if (!btn) return;
        const isLight = theme === 'light';
        btn.innerHTML = isLight ? ICON_THEME_SUN : ICON_THEME_MOON;
        btn.setAttribute('aria-pressed', isLight ? 'true' : 'false');
        const label = t(isLight ? 'nav.themeToDark' : 'nav.themeToLight');
        btn.setAttribute('aria-label', label);
        btn.title = label;
    }

    function applyTheme(next) {
        theme = next === 'light' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', theme);
        setThemeToggleUI();
        // Re-picks MOOD_AUDIO_RECIPE vs MOOD_AUDIO_RECIPE_LIGHT for whatever mood is already
        // playing, so the ambience actually changes character with the theme, not just color.
        if (audioEnabled && currentMoodNodes) crossfadeMoodAmbience(profile.mood || 'calm');
    }

    function toggleTheme() {
        applyTheme(theme === 'light' ? 'dark' : 'light');
        saveState();
    }
    document.getElementById('themeToggleBtn').addEventListener('click', toggleTheme);

    // If audio was left on last visit, the browser still won't let it start until the very
    // first gesture on this new page load — catch that gesture, wherever it happens, and
    // start the ambience then instead of making the person hunt down the toggle again.
    function armAudioAutoResume() {
        if (!audioEnabled) return;
        const resume = () => {
            const ctx = ensureAudioContext();
            if (ctx && ctx.state === 'suspended') ctx.resume();
            if (!currentMoodNodes) startMoodAmbience(profile.mood || 'calm');
        };
        document.addEventListener('pointerdown', resume, { once: true });
        document.addEventListener('keydown', resume, { once: true });
    }

    /* =========================================================
       12. PATH BUILDING (the algorithm)
    ========================================================= */
    function goalWeight(g) {
        const gs = stats.goalStats[g] || { shown: 0, completed: 0 };
        if (gs.shown < 3) return 1;
        const ratio = gs.completed / gs.shown;
        if (ratio > 0.66) return 1.6;
        if (ratio < 0.34) return 0.4;
        return 1;
    }
    const COUNT_STEPS = [
        [5, 1], [10, 2], [20, 3], [35, 4], [55, 5], [999, 6]
    ];
    function countForTime(mins) {
        for (const [max, count] of COUNT_STEPS) { if (mins <= max) return count; }
        return 6;
    }

    // Samples each goal's template pool several times (random picks vary per call, so one
    // sample can undercount) and counts how many DISTINCT titles genuinely match the chosen
    // style. Used to stop buildPath from padding a style-locked path with the wrong format
    // just to hit a target count — a short, honestly-all-video path beats a long path that's
    // secretly mostly reads.
    function countStyleMatches(goals, style) {
        if (!style) return Infinity; // no style preference set — nothing to cap against
        const titles = new Set();
        goals.forEach(g => {
            for (let i = 0; i < 8; i++) {
                let templates;
                try { templates = TEMPLATE_BUILDERS[g] ? TEMPLATE_BUILDERS[g]() : []; }
                catch (e) { templates = []; }
                templates.forEach(t => { if (t.type === style) titles.add(t.title); });
            }
        });
        return titles.size;
    }

    function buildPath() {
        let count = countForTime(profile.time);
        if (profile.mood === 'tired') count = Math.max(1, count - 1);
        if (profile.mood === 'stressed') count = Math.max(1, count - 1);
        if (profile.mood === 'energized') count = count + 1;

        let goals = profile.goals.length ? profile.goals.slice() : ['reading'];
        const styleSupply = countStyleMatches(goals, profile.style);
        if (styleSupply > 0) count = Math.min(count, styleSupply);

        let deprioritized = [];
        goals.forEach(g => {
            const gs = stats.goalStats[g] || { shown: 0, completed: 0 };
            if (gs.shown >= 3 && (gs.completed / gs.shown) < 0.34) deprioritized.push(g);
        });

        let pool = [];
        goals.forEach(g => {
            const w = goalWeight(g);
            const reps = Math.max(1, Math.round(w * 10));
            for (let i = 0; i < reps; i++) pool.push(g);
        });
        shuffleArr(pool);

        // Real variety, not the same handful on repeat: skip anything already used earlier in
        // THIS path, and prefer anything that wasn't just shown in the last several days.
        const recentlyShown = new Set(stats.recentTitles || []);
        const usedTitlesToday = new Set();

        // How many slots any single goal is allowed to fill. With several goals picked, this
        // keeps one from dominating; with only one or two goals picked, the cap has to scale up
        // or a longer path would stall trying to "diversify" across goals that don't exist.
        const maxPerGoal = Math.max(2, Math.ceil(count / goals.length) + 1);

        const path = [];
        let gi = 0, guard = 0;
        const usedGoalCount = {};
        while (path.length < count && guard < 200) {
            guard++;
            const g = pool[gi % pool.length]; gi++;
            usedGoalCount[g] = (usedGoalCount[g] || 0) + 1;
            if (usedGoalCount[g] > maxPerGoal && guard < 150) continue; // avoid one goal dominating

            const chosen = pickFreshFromGoal(g, usedTitlesToday, recentlyShown);
            if (!chosen) continue;
            usedTitlesToday.add(chosen.title);
            path.push(Object.assign({ goal: g, completed: false }, chosen));
        }
        return { path, deprioritized };
    }
    // Some templates draw one random variant per call (e.g. design's brief is one of five
    // possible prompts) — so a single TEMPLATE_BUILDERS[g]() call only samples ONE point in
    // that content space, and checking it against history can miss a fresh option that a
    // different random draw would've produced. Re-roll the generator itself a few times
    // before accepting a repeat, so "only 3 template slots" doesn't undersell content that
    // actually has several times that many real variants.
    function pickFreshFromGoal(g, usedToday, recentlyShown, excludeTitle) {
        let fallback = null;
        for (let attempt = 0; attempt < 6; attempt++) {
            const templates = TEMPLATE_BUILDERS[g] ? TEMPLATE_BUILDERS[g]() : [];
            if (!templates.length) return null;
            let candidates = templates.filter(t => t.title !== excludeTitle);
            if (!candidates.length) candidates = templates;

            const notUsedAnywhere = candidates.filter(t => !usedToday.has(t.title) && !recentlyShown.has(t.title));
            if (notUsedAnywhere.length) {
                const styleMatches = notUsedAnywhere.filter(t => t.type === profile.style);
                const pool = styleMatches.length ? styleMatches : notUsedAnywhere;
                return pool[Math.floor(Math.random() * pool.length)];
            }
            // Not a clean win this attempt — keep the best fallback seen so far (prefer at
            // least avoiding a repeat WITHIN today, even if it repeats an earlier day) in case
            // every attempt fails to find something wholly fresh.
            const notToday = candidates.filter(t => !usedToday.has(t.title));
            const pool2 = notToday.length ? notToday : candidates;
            const styleMatches2 = pool2.filter(t => t.type === profile.style);
            const finalPool2 = styleMatches2.length ? styleMatches2 : pool2;
            fallback = finalPool2[Math.floor(Math.random() * finalPool2.length)];
        }
        return fallback;
    }
    function shuffleArr(arr) {
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]]; }
        return arr;
    }

    // Swaps ONE slot in today's path for a different real activity on the same goal —
    // used by both the "🔄 Swap" control in the path list and "Try a different one" inside
    // the activity overlay, so a suggestion you don't want is never a dead end.
    function regenerateActivity(index) {
        const current = todaysPath[index];
        if (!current) return false;
        const recentlyShown = new Set(stats.recentTitles || []);
        const usedTitlesToday = new Set(todaysPath.map(a => a.title));
        const chosen = pickFreshFromGoal(current.goal, usedTitlesToday, recentlyShown, current.title);
        if (!chosen || chosen.title === current.title) return false; // nothing else exists for this goal
        todaysPath[index] = Object.assign({ goal: current.goal, completed: false }, chosen);
        if (!stats.recentTitles) stats.recentTitles = [];
        stats.recentTitles.push(chosen.title);
        if (stats.recentTitles.length > 40) stats.recentTitles = stats.recentTitles.slice(-40);
        saveState();
        return true;
    }

    function novaPathMessage(pathResult) {
        const moodLabel = t('moodOpt.' + profile.mood + '.label').toLowerCase();
        const n = pathResult.path.length;
        let msg = t('path.novaMessage', { mood: moodLabel, n: n, s: n === 1 ? '' : 's', time: profile.time });
        msg = identity.name ? (identity.name + ', ' + msg) : (msg.charAt(0).toUpperCase() + msg.slice(1));
        const flavor = t('path.moodFlavor.' + profile.mood);
        return msg + (flavor ? ' ' + flavor : '');
    }

    async function buildAndShowPath() {
        const result = buildPath();
        todaysPath = result.path;
        deprioritizedGoal = result.deprioritized.length ? result.deprioritized[0] : null;

        todaysPath.forEach(a => {
            if (!stats.goalStats[a.goal]) stats.goalStats[a.goal] = { shown: 0, completed: 0 };
            stats.goalStats[a.goal].shown += 1;
        });
        if (!stats.recentTitles) stats.recentTitles = [];
        todaysPath.forEach(a => stats.recentTitles.push(a.title));
        if (stats.recentTitles.length > 40) stats.recentTitles = stats.recentTitles.slice(-40);

        const today = todayISO();
        if (!stats.daysActive.includes(today)) stats.daysActive.push(today);
        await saveState();

        document.getElementById('novaCard').textContent = novaPathMessage(result);
        const noteEl = document.getElementById('novaNote');
        if (deprioritizedGoal) {
            const label = t('goal.' + deprioritizedGoal + '.label');
            noteEl.innerHTML = t('path.skippingNote', { goal: label }) + `<br><button id="dropGoalBtn">${t('path.pickNewFocus')}</button>`;
            noteEl.classList.add('visible');
            document.getElementById('dropGoalBtn').addEventListener('click', () => {
                noteEl.classList.remove('visible');
                goToGoals(); // keeps the current pick pre-selected — just makes it easy to change
            });
        } else {
            noteEl.classList.remove('visible');
            noteEl.innerHTML = '';
        }

        document.getElementById('pathCount').textContent = t('path.stopCount', { n: todaysPath.length, s: todaysPath.length === 1 ? '' : 's' });
        renderPathList();
        renderDayNote();
    }

    // The free-text note lives under today's path regardless of which goal is active — it's
    // not tied to any one subject, just to the day. Saved into stats.dayNotes[iso] so it shows
    // up in the day's detail view in My Growth (see openDayDetail) alongside the real activities.
    let dayNoteSaveTimer = null;
    function renderDayNote() {
        const el = document.getElementById('dayNoteInput');
        if (!el) return;
        el.value = stats.dayNotes[todayISO()] || '';
    }
    function saveDayNote(text) {
        const iso = todayISO();
        if (text.trim()) stats.dayNotes[iso] = text; else delete stats.dayNotes[iso];
    }
    const dayNoteInput = document.getElementById('dayNoteInput');
    dayNoteInput.addEventListener('input', () => {
        saveDayNote(dayNoteInput.value);
        clearTimeout(dayNoteSaveTimer);
        dayNoteSaveTimer = setTimeout(saveState, 500);
    });
    dayNoteInput.addEventListener('blur', () => { clearTimeout(dayNoteSaveTimer); saveState(); });

    // A one-line, honest preview of what's actually inside — pulled straight from the
    // activity's real content, never a generic placeholder — so it's clear before opening
    // whether it's a workout, a recipe, a passage, and so on.
    function activityPreview(a) {
        switch (a.kind) {
            case 'reading': return a.data.passage.body.slice(0, 72).trim() + '…';
            case 'language': { const w = a.data.set.words[0]; return t('preview.langExample', { word: w.word, translation: w.translation }); }
            case 'design': return a.data.brief.prompt.slice(0, 64).trim() + '…';
            case 'palette': return t('preview.livePalette');
            case 'coding': return t('preview.writeChecked', { fn: a.data.challenge.fn });
            case 'recipe': return t('preview.ingredientsSteps', { ing: a.data.recipe.ingredients.length, steps: a.data.recipe.steps.length });
            case 'checklist': return a.data.steps[0];
            case 'photoprompt': return a.data.prompt.length > 64 ? a.data.prompt.slice(0, 64).trim() + '…' : a.data.prompt;
            case 'culture': return a.data.piece.body.slice(0, 72).trim() + '…';
            case 'embedvideo': return t('preview.playsHereOnPage');
            case 'link': return a.data.note || a.data.label;
            default: return '';
        }
    }

    function renderPathList() {
        const listEl = document.getElementById('pathList');
        const typeIcon = { reading: '📖', video: '🎥', audio: '🎧', challenge: '⚡', creative: '✏️' };
        listEl.innerHTML = todaysPath.map((a, i) => {
            const meta = GOAL_META[a.goal];
            const canSwap = !a.completed && (TEMPLATE_BUILDERS[a.goal] ? TEMPLATE_BUILDERS[a.goal]().length : 0) > 1;
            const goalLabel = t('goal.' + a.goal + '.label');
            return `<article class="activity-card ${a.completed ? 'completed' : ''}" style="--goal-color:${meta.color}">
      <div class="activity-row">
        <div class="activity-icon">${typeIcon[a.type] || meta.icon}</div>
        <div class="activity-body">
          <div class="activity-time">${a.time} ${t('time.unit')} · ${goalLabel}</div>
          <div class="activity-title">${a.title}</div>
          <div class="activity-preview">${activityPreview(a)}</div>
        </div>
        <div class="activity-actions">
          ${canSwap ? `<button class="swap-btn" data-index="${i}" title="${t('path.swapTooltip', { goal: goalLabel })}">🔄</button>` : ''}
          <button class="open-btn" data-index="${i}">${a.completed ? t('path.review') : t('path.open')}</button>
        </div>
      </div>
    </article>`;
        }).join('');
        listEl.querySelectorAll('.open-btn').forEach(btn => {
            btn.addEventListener('click', () => openActivity(parseInt(btn.dataset.index, 10)));
        });
        listEl.querySelectorAll('.swap-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                regenerateActivity(parseInt(btn.dataset.index, 10));
                renderPathList();
            });
        });
    }

    /* =========================================================
       13. ACTIVITY OVERLAY — real, specific, interactive content
    ========================================================= */
    const overlay = document.getElementById('activityOverlay');
    const overlayContent = document.getElementById('overlayContent');
    document.getElementById('overlayClose').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });

    function closeOverlay() { overlay.hidden = true; overlayActiveIndex = null; }

    function openActivity(index) {
        overlayActiveIndex = index;
        const a = todaysPath[index];
        const meta = GOAL_META[a.goal];
        overlayContent.innerHTML = renderOverlayBody(a, meta);
        overlayContent.querySelector('.overlay-inner')?.style.setProperty('--goal-color', meta.color);
        wireOverlayInteractions(a, meta, index);
        overlay.hidden = false;
    }

    function renderOverlayBody(a, meta) {
        const canSwap = !a.completed && (TEMPLATE_BUILDERS[a.goal] ? TEMPLATE_BUILDERS[a.goal]().length : 0) > 1;
        let inner = `<div class="overlay-inner" style="--goal-color:${meta.color}">
    <p class="od-eyebrow">${meta.icon} ${t('goal.' + a.goal + '.label')} · ${a.time} ${t('time.unit')}</p>
    <h3 class="od-title">${a.title}</h3>
    ${canSwap ? `<button class="od-swap-btn" id="overlaySwapBtn">🔄 ${t('overlay.tryDifferent')}</button>` : ''}
    <div class="od-body">`;

        switch (a.kind) {
            case 'reading':
                if (MOOD_READING_NOTE_MOODS.includes(profile.mood) && a.data.passage.moods && a.data.passage.moods.includes(profile.mood)) {
                    inner += `<p class="od-source">${t('overlay.moodNote.' + profile.mood)}</p>`;
                }
                inner += `<p>${a.data.passage.body}</p>`;
                inner += `<div class="od-block"><h4>${t('overlay.wantMoreLikeThis')}</h4>` +
                    a.data.links.map(l => `<a class="od-link-btn" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join('') + `</div>`;
                break;
            case 'language':
                inner += `<div class="od-block"><h4>${t('overlay.wordsHeading', { language: t('language.' + a.data.set.language), n: a.data.set.words.length })}</h4><div class="od-ingredients">` +
                    a.data.set.words.map((w, i) => `<div class="lang-word-row">
              ${canSpeak ? `<button type="button" class="lang-speak-btn" data-word-index="${i}" aria-label="${t('overlay.pronounceLabel', { word: w.word })}" title="${t('overlay.pronounceTitle')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                  <path d="M4 9v6h4l5 5V4L8 9H4z" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M16.3 8.5a5 5 0 0 1 0 7" stroke-linecap="round" />
                </svg>
              </button>` : ''}
              <div><b>${w.word}</b> — ${w.translation}<br><span class="od-source">${w.example}</span></div>
            </div>`).join('') +
                    `</div></div>`;
                break;
            case 'design':
                inner += `<p>${a.data.brief.prompt}</p><p class="od-source">${a.data.brief.constraint}</p>`;
                inner += `<div class="od-block"><h4>${t('overlay.toolsToDoThis')}</h4>` +
                    a.data.tools.map(l => `<a class="od-link-btn" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join('') + `</div>`;
                inner += `<div class="od-block"><h4>${t('overlay.describeWhatMade')}</h4>
        <textarea class="od-textarea" id="designFeedbackInput" placeholder="${t('overlay.designFeedbackPlaceholder')}"></textarea>
        <button class="od-feedback-btn" id="designFeedbackBtn">${t('overlay.getFeedback')}</button>
        <div class="od-feedback-out" id="designFeedbackOut"></div></div>`;
                break;
            case 'palette': {
                const colors = seededPalette(String(Date.now()));
                inner += `<p>${t('overlay.paletteGenerated')}</p>`;
                inner += `<div class="od-palette">` + colors.map(c => `<div class="od-swatch" style="background:${c.hsl}"><span class="hex">${c.role}</span></div>`).join('') + `</div>`;
                inner += `<div class="od-block"><h4>${t('overlay.tryItSomewhereReal')}</h4>` +
                    a.data.tools.map(l => `<a class="od-link-btn" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join('') + `</div>`;
                break;
            }
            case 'coding': {
                const c = a.data.challenge;
                inner += `<p>${t('overlay.writeFnInstruction', { fn: c.fn })}</p>`;
                inner += `<div class="od-block"><textarea class="od-code-box" id="codeBox">${escapeHtml(c.starter)}</textarea>
        <button class="od-run-btn" id="runCodeBtn">${t('overlay.runTests')}</button>
        <div class="od-check-result" id="codeResult"></div></div>`;
                inner += `<div class="od-block"><h4>${t('overlay.stuckLearnMore')}</h4>` +
                    a.data.learn.map(l => `<a class="od-link-btn" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join('') + `</div>`;
                break;
            }
            case 'recipe': {
                const r = a.data.recipe;
                inner += `<p class="od-source">${t('overlay.servesTime', { servings: r.servings, time: r.time })}</p>`;
                inner += `<div class="od-block"><h4>${t('overlay.ingredients')}</h4><div class="od-ingredients">` +
                    r.ingredients.map(i => `<div>• ${i}</div>`).join('') + `</div></div>`;
                inner += `<div class="od-block"><h4>${t('overlay.steps')}</h4><ol class="od-steps">` +
                    r.steps.map(s => `<li>${s}</li>`).join('') + `</ol></div>`;
                break;
            }
            case 'checklist':
                inner += `<div class="od-block"><ol class="od-steps">` + a.data.steps.map(s => `<li>${s}</li>`).join('') + `</ol></div>`;
                if (a.data.learn) { inner += `<div class="od-block"><h4>${t('overlay.goDeeper')}</h4>` + a.data.learn.map(l => `<a class="od-link-btn" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join('') + `</div>`; }
                break;
            case 'photoprompt':
                inner += `<p>${a.data.prompt}</p>`;
                inner += `<div class="od-block"><h4>${t('overlay.sharpenEyeFirst')}</h4>` + a.data.learn.map(l => `<a class="od-link-btn" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join('') + `</div>`;
                break;
            case 'culture':
                inner += `<p>${a.data.piece.body}</p>`;
                inner += `<div class="od-block"><h4>${t('overlay.exploreMore')}</h4>` + a.data.links.map(l => `<a class="od-link-btn" href="${l.url}" target="_blank" rel="noopener">${l.label} ↗</a>`).join('') + `</div>`;
                break;
            case 'embedvideo': {
                const v = a.data.video;
                inner += `<div class="od-embed-wrap"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}" title="${v.title}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
                inner += `<p class="od-source">${a.data.note || t('overlay.playsHereLumen')}</p>`;
                inner += `<a class="od-link-btn" href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">${t('overlay.openOnYoutube')} ↗</a>`;
                break;
            }
            case 'link':
                if (a.data.note) inner += `<p>${a.data.note}</p>`;
                inner += `<a class="od-link-btn" href="${a.data.url}" target="_blank" rel="noopener">${a.data.label} ↗</a>`;
                break;
            default:
                inner += `<p>${a.title}</p>`;
        }

        inner += `</div>
    <button class="od-complete-btn" id="overlayCompleteBtn" ${a.completed ? 'disabled' : ''}>${a.completed ? t('overlay.completed') : t('overlay.markComplete')}</button>
  </div>`;
        return inner;
    }

    function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

    function wireOverlayInteractions(a, meta, index) {
        document.querySelectorAll('.lang-speak-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const w = a.data.set.words[parseInt(btn.dataset.wordIndex, 10)];
                if (w) speakWord(w.word, LANG_SPEECH_CODE[a.data.set.language]);
            });
        });

        const swapBtn = document.getElementById('overlaySwapBtn');
        if (swapBtn) {
            swapBtn.addEventListener('click', () => {
                if (regenerateActivity(index)) {
                    openActivity(index); // re-render the overlay in place with the new activity
                    renderPathList();    // keep the path screen behind it in sync
                }
            });
        }

        const runBtn = document.getElementById('runCodeBtn');
        if (runBtn) {
            runBtn.addEventListener('click', () => {
                const code = document.getElementById('codeBox').value;
                const resultEl = document.getElementById('codeResult');
                const c = a.data.challenge;
                try {
                    const factory = new Function(code + `\nreturn ${c.fn};`);
                    const fn = factory();
                    let passed = 0;
                    const details = [];
                    c.tests.forEach(([input, expected]) => {
                        let got;
                        try { got = fn(input); } catch (err) { got = t('overlay.errorPrefix') + ' ' + err.message; }
                        const ok = JSON.stringify(got) === JSON.stringify(expected);
                        if (ok) passed++;
                        details.push(`${ok ? '✓' : '✗'} ${c.fn}(${JSON.stringify(input)}) → ${JSON.stringify(got)}${ok ? '' : ' ' + t('overlay.expectedSuffix', { expected: JSON.stringify(expected) })}`);
                    });
                    const allPass = passed === c.tests.length;
                    resultEl.className = 'od-check-result ' + (allPass ? 'pass' : 'fail');
                    resultEl.innerHTML = `${t('overlay.testsPassed', { passed, total: c.tests.length })}<br><small>${details.join('<br>')}</small>`;
                    if (allPass) {
                        const completeBtn = document.getElementById('overlayCompleteBtn');
                        if (completeBtn && !completeBtn.disabled) completeBtn.click();
                    }
                } catch (err) {
                    resultEl.className = 'od-check-result fail';
                    resultEl.textContent = t('overlay.errorPrefix') + ' ' + err.message;
                }
            });
        }

        const fbBtn = document.getElementById('designFeedbackBtn');
        if (fbBtn) {
            fbBtn.addEventListener('click', () => {
                const text = document.getElementById('designFeedbackInput').value.trim();
                const out = document.getElementById('designFeedbackOut');
                out.innerHTML = buildDesignFeedback(text);
            });
        }

        const completeBtn = document.getElementById('overlayCompleteBtn');
        if (completeBtn) {
            completeBtn.addEventListener('click', async () => {
                if (a.completed) return;
                a.completed = true;
                stats.goalStats[a.goal].completed += 1;
                stats.totalCompleted += 1;
                stats.history.unshift({ goal: a.goal, title: a.title, time: a.time, dateISO: new Date().toISOString() });
                if (stats.history.length > 300) stats.history.length = 300;
                checkBadges();
                await saveState();
                updateStreakChip();
                completeBtn.disabled = true;
                completeBtn.textContent = t('overlay.completed');
                renderPathList();
            });
        }
    }

    // Keyword detection stays multilingual (English + AR/ES/FR equivalents combined) since the
    // user's typed description can be in whichever language they're using the app in.
    function buildDesignFeedback(text) {
        const lower = text.toLowerCase();
        const checklist = [
            { key: 'hierarchy', label: t('feedback.hierarchy'), hit: /hierarch|size|biggest|larg|تسلسل|هرمي|حجم|أكبر|jerarqu|tamaño|grande|mayor|hiérarch|taille|plus grand/.test(lower) },
            { key: 'contrast', label: t('feedback.contrast'), hit: /contrast|dark|light|bold|تباين|غامق|فاتح|عريض|contraste|oscuro|claro|negrita|sombre|clair|gras/.test(lower) },
            { key: 'spacing', label: t('feedback.spacing'), hit: /space|spacing|margin|padding|room|مساحة|فراغ|هامش|تباعد|espacio|margen|relleno|espace|marge|respiration/.test(lower) },
            { key: 'alignment', label: t('feedback.alignment'), hit: /align|grid|center|edge|محاذاة|شبكة|توسيط|حافة|alinea|cuadrícula|centr|borde|aligne|grille|bord/.test(lower) },
            { key: 'restraint', label: t('feedback.restraint'), hit: /two|three|2|3|limit|restrain|لونين|ثلاثة|حد|تقييد|dos|tres|límite|restr|deux|trois|limite|restrein/.test(lower) }
        ];
        const missing = checklist.filter(c => !c.hit);
        const hitCount = checklist.length - missing.length;
        let out = `<p>${t('feedback.scoreLine', { n: hitCount })}</p>`;
        if (missing.length) {
            out += `<p>${t('feedback.worthChecking')}</p><ul>` + missing.map(m => `<li>${m.label}</li>`).join('') + `</ul>`;
        } else {
            out += `<p>${t('feedback.allCovered')}</p>`;
        }
        return out;
    }

    // One-time particle burst to mark finishing a path — removes its own DOM node when the
    // animation ends, so nothing lingers or needs to be cleaned up elsewhere.
    function celebrateCompletion() {
        const burst = document.createElement('div');
        burst.className = 'celebrate-burst';
        burst.setAttribute('aria-hidden', 'true');
        const colors = ['var(--accent)', 'var(--accent-glow)', 'var(--ink-bright)'];
        const count = 16;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + (Math.random() * 0.3 - 0.15);
            const distance = 80 + Math.random() * 70;
            const p = document.createElement('span');
            p.className = 'celebrate-particle';
            p.style.setProperty('--dx', Math.cos(angle) * distance + 'px');
            p.style.setProperty('--dy', Math.sin(angle) * distance + 'px');
            p.style.background = colors[i % colors.length];
            p.style.animationDelay = (Math.random() * 0.15) + 's';
            burst.appendChild(p);
        }
        document.body.appendChild(burst);
        setTimeout(() => burst.remove(), 1600);
    }

    document.getElementById('finishBtn').addEventListener('click', () => {
        const doneCount = todaysPath.filter(a => a.completed).length;
        document.getElementById('completionHeading').textContent = identity.name
            ? t('completion.headingNamed', { name: identity.name })
            : t('completion.headingDefault');
        document.getElementById('completionStats').innerHTML = `
    <div><span class="stat-num">${doneCount}/${todaysPath.length}</span><span class="stat-label">${t('completion.statDone')}</span></div>
    <div><span class="stat-num">${stats.daysActive.length}</span><span class="stat-label">${t('completion.statDaysActive')}</span></div>
    <div><span class="stat-num">${stats.totalCompleted}</span><span class="stat-label">${t('completion.statAllTime')}</span></div>`;
        showScreen('completion');
        celebrateCompletion();
    });
    document.getElementById('viewGrowthBtn').addEventListener('click', () => { renderProgress(); showScreen('progress'); });

    /* =========================================================
       14. STREAK + BADGES ("surprise" features)
    ========================================================= */
    function computeStreak() {
        if (!stats.daysActive.length) return 0;
        const days = new Set(stats.daysActive);
        let streak = 0;
        let cursor = new Date();
        for (; ;) {
            const iso = cursor.toISOString().slice(0, 10);
            if (days.has(iso)) { streak++; cursor.setDate(cursor.getDate() - 1); }
            else break;
        }
        return streak;
    }
    function updateStreakChip() {
        const streak = computeStreak();
        const chip = document.getElementById('streakChip');
        document.getElementById('streakCount').textContent = streak;
        chip.hidden = streak < 2;
    }
    const BADGE_DEFS = [
        { id: 'first-step', key: 'badge.firstStep', test: s => s.totalCompleted >= 1 },
        { id: 'ten-strong', key: 'badge.tenStrong', test: s => s.totalCompleted >= 10 },
        { id: 'fifty-deep', key: 'badge.fiftyDeep', test: s => s.totalCompleted >= 50 },
        { id: 'week-streak', key: 'badge.weekStreak', test: () => computeStreak() >= 7 },
        { id: 'well-rounded', key: 'badge.wellRounded', test: s => Object.values(s.goalStats).filter(g => g.completed > 0).length >= 4 }
    ];
    function checkBadges() {
        BADGE_DEFS.forEach(b => { if (!stats.badges.includes(b.id) && b.test(stats)) stats.badges.push(b.id); });
    }

    /* =========================================================
       15. PROGRESS / FOREST SCREEN
    ========================================================= */
    function treeStage(count) {
        if (count === 0) return '🌰';
        if (count < 3) return '🌱';
        if (count < 10) return '🌿';
        if (count < 20) return '🌳';
        return '🌲';
    }
    function levelTier(count) {
        if (count < 3) return t('tier.explorer');
        if (count < 6) return t('tier.builder');
        if (count < 10) return t('tier.creator');
        return t('tier.master');
    }

    function renderActivityCalendar() {
        const wrap = document.getElementById('calendarWrap');
        if (!wrap) return;
        const days = 28;
        const activeSet = new Set(stats.daysActive);
        const todayD = new Date();
        let cells = '';
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(todayD); d.setDate(d.getDate() - i);
            const iso = d.toISOString().slice(0, 10);
            const isActive = activeSet.has(iso);
            // Only days with real activity are clickable — an empty day has nothing to open.
            cells += isActive
                ? `<button type="button" class="cal-cell active" data-date="${iso}" title="${iso}" aria-label="${iso}"></button>`
                : `<span class="cal-cell" title="${iso}"></span>`;
        }
        wrap.innerHTML = `<div class="cal-grid">${cells}</div>`;
        wrap.querySelectorAll('.cal-cell.active').forEach(cell => {
            cell.addEventListener('click', () => openDayDetail(cell.dataset.date));
        });
    }

    const DATE_LOCALE = { en: 'en-US', ar: 'ar', es: 'es-ES', fr: 'fr-FR' };

    // Opens the same activity overlay used for today's path, but filled with a read-only
    // summary of everything real that was actually completed on the clicked past day —
    // pulled straight from stats.history, never reconstructed or guessed.
    function openDayDetail(iso) {
        if (!iso) return;
        const dayHistory = stats.history.filter(h => h.dateISO && h.dateISO.slice(0, 10) === iso);
        const d = new Date(iso + 'T00:00:00');
        const dateLabel = d.toLocaleDateString(DATE_LOCALE[currentLang] || 'en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const totalTime = dayHistory.reduce((sum, h) => sum + (h.time || 0), 0);
        const summary = dayHistory.length
            ? t(dayHistory.length === 1 ? 'growth.dayActivitiesSingular' : 'growth.dayActivitiesPlural', { n: dayHistory.length, time: totalTime })
            : t('growth.dayEmpty');
        const rows = dayHistory.map(h => {
            const meta = GOAL_META[h.goal] || {};
            return `<article class="activity-card completed" style="--goal-color:${meta.color || 'var(--accent)'}">
      <div class="activity-row">
        <div class="activity-icon">${meta.icon || '✨'}</div>
        <div class="activity-body">
          <div class="activity-time">${h.time} ${t('time.unit')} · ${t('goal.' + h.goal + '.label')}</div>
          <div class="activity-title">${h.title}</div>
        </div>
      </div>
    </article>`;
        }).join('');
        const noteText = stats.dayNotes[iso];
        const noteBlock = noteText
            ? `<div class="od-block"><h4>${t('growth.yourNoteHeading')}</h4><p>${escapeHtml(noteText).replace(/\n/g, '<br>')}</p></div>`
            : '';
        overlayContent.innerHTML = `<div class="overlay-inner">
    <p class="od-eyebrow">${t('growth.eyebrow')}</p>
    <h3 class="od-title">${dateLabel}</h3>
    <p class="od-source">${summary}</p>
    <div class="od-body">${rows}${noteBlock}</div>
  </div>`;
        overlayActiveIndex = null;
        overlay.hidden = false;
    }
    // Real, honest progress toward whichever badge is realistically next — never invents a
    // number, just reads straight off `stats`.
    function nextMilestoneText() {
        if (!stats.badges.includes('first-step')) return t('milestone.first', { badge: t('badge.firstStep') });
        if (!stats.badges.includes('ten-strong')) {
            const left = Math.max(0, 10 - stats.totalCompleted);
            return t(left === 1 ? 'milestone.countSingular' : 'milestone.countPlural', { n: left, badge: t('badge.tenStrong') });
        }
        if (!stats.badges.includes('week-streak')) {
            const left = Math.max(0, 7 - computeStreak());
            return left > 0 ? t(left === 1 ? 'milestone.streakSingular' : 'milestone.streakPlural', { n: left, badge: t('badge.weekStreak') }) : t('milestone.streakToday');
        }
        if (!stats.badges.includes('well-rounded')) return t('milestone.wellRounded', { badge: t('badge.wellRounded') });
        if (!stats.badges.includes('fifty-deep')) {
            const left = Math.max(0, 50 - stats.totalCompleted);
            return t(left === 1 ? 'milestone.countSingular' : 'milestone.countPlural', { n: left, badge: t('badge.fiftyDeep') });
        }
        return t('milestone.allDone');
    }

    // Which identity a real subject belongs to — used only to show a small "part of Builder"
    // style tag on the forest, so progress still reads back to the identity you picked, not
    // just the raw subject.
    function identityForGoal(g) {
        return Object.keys(IDENTITY_META).find(id => IDENTITY_META[id].goals.includes(g));
    }

    function renderProgress() {
        const dashboard = document.getElementById('dashboard');
        const treeGrid = document.getElementById('treeGrid');
        const novaGrowth = document.getElementById('novaGrowthCard');
        const statsRow = document.getElementById('growthStatsRow');
        const badgeRow = document.getElementById('badgeRow');
        const badgesHeading = document.getElementById('badgesHeading');

        statsRow.innerHTML = `
    <div class="growth-stat"><span class="num">${stats.totalCompleted}</span><span class="lbl">${t('growth.statCompleted')}</span></div>
    <div class="growth-stat"><span class="num">${stats.daysActive.length}</span><span class="lbl">${t('growth.statDaysActive')}</span></div>
    <div class="growth-stat"><span class="num">${computeStreak()}</span><span class="lbl">${t('growth.statDayStreak')}</span></div>`;

        renderActivityCalendar();
        document.getElementById('milestoneNote').textContent = nextMilestoneText();

        if (stats.badges.length) {
            badgesHeading.hidden = false;
            badgeRow.innerHTML = stats.badges.map(id => {
                const def = BADGE_DEFS.find(b => b.id === id);
                return `<span class="badge-pill">🏅 ${def ? t(def.key) : id}</span>`;
            }).join('');
        } else {
            badgesHeading.hidden = true;
            badgeRow.innerHTML = '';
        }

        const totals = {}, counts = {};
        stats.history.forEach(h => {
            totals[h.goal] = (totals[h.goal] || 0) + h.time;
            counts[h.goal] = (counts[h.goal] || 0) + 1;
        });

        const goalsWithData = Object.keys(totals);
        if (goalsWithData.length === 0) {
            dashboard.innerHTML = `<p class="empty-note">${t('growth.emptyDashboard')}</p>`;
            treeGrid.innerHTML = `<p class="empty-note">${t('growth.emptyForest')}</p>`;
            novaGrowth.textContent = identity.name
                ? t('growth.emptyNovaNamed', { name: identity.name })
                : t('growth.emptyNova');
            return;
        }

        const sorted = goalsWithData.sort((a, b) => totals[b] - totals[a]);
        const maxVal = Math.max(...sorted.map(g => totals[g]), 1);
        dashboard.innerHTML = sorted.map(g => {
            const meta = GOAL_META[g];
            const pct = Math.round((totals[g] / maxVal) * 100);
            return `<div class="dash-row">
      <div class="dash-label">${meta.icon} ${t('goal.' + g + '.label')}</div>
      <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${pct}%; background:${meta.color}"></div></div>
      <div class="dash-value">${totals[g]} ${t('time.unit')}</div>
    </div>`;
        }).join('');

        treeGrid.innerHTML = sorted.map(g => {
            const meta = GOAL_META[g];
            const c = counts[g];
            const parentIdentityId = identityForGoal(g);
            const parentIdentity = parentIdentityId ? IDENTITY_META[parentIdentityId] : null;
            return `<div class="tree-card" style="--goal-color:${meta.color}">
      <div class="tree-emoji">${treeStage(c)}</div>
      <div class="tree-goal">${t('goal.' + g + '.label')}</div>
      <div class="tree-level">${t('growth.levelLabel', { n: c, tier: levelTier(c) })}</div>
      ${parentIdentity ? `<div class="tree-identity">${parentIdentity.icon} ${t('identity.' + parentIdentityId + '.label')}</div>` : ''}
    </div>`;
        }).join('');

        const topGoal = sorted[0];
        const topCount = counts[topGoal];
        const days = stats.daysActive.length;
        novaGrowth.textContent = t('growth.topGoalSummary', {
            goal: t('goal.' + topGoal + '.label'), level: topCount, tier: levelTier(topCount),
            days: days, ds: days === 1 ? '' : 's', count: stats.totalCompleted, cs: stats.totalCompleted === 1 ? '' : 's'
        });
    }

    document.getElementById('buildAgainBtn').addEventListener('click', () => goToGoals());
    document.getElementById('homeBtn').addEventListener('click', () => { showScreen('welcome'); });
    document.getElementById('restartAllBtn').addEventListener('click', async () => {
        if (!window.confirm(t('growth.eraseConfirm'))) return;
        profile = defaultProfile();
        stats = defaultStats();
        todaysPath = [];
        document.body.setAttribute('data-mood', 'none');
        const moodSel = document.getElementById('moodSwitcher');
        if (moodSel) moodSel.value = profile.mood;
        document.getElementById('streakChip').hidden = true;
        await saveState();
        showScreen('welcome');
    });

    /* =========================================================
       16. PROFILE / ACCOUNT — real, server-verified authentication via
       Firebase Auth (email/password + Google). No passwords ever touch
       localStorage; Firebase's own backend owns credential storage and
       verification. `identity` stays a local display-info cache only
       (name/email/avatar/photo/uid) so the UI can paint instantly.
    ========================================================= */
    // Maps a handful of common Firebase Auth error codes to the same friendly,
    // in-place form-note UI the sign-in form already had — everything else
    // (unexpected codes) falls back to a generic message rather than a raw
    // Firebase error string.
    function firebaseAuthErrorMessage(err) {
        const code = (err && err.code) || '';
        // The "config still has placeholder values" codes vary a bit by SDK version — e.g. a
        // bad apiKey currently comes back as 'auth/api-key-not-valid.-please-pass-a-valid-api-key.'
        // rather than a short fixed code — so this checks by substring instead of exact match.
        if (code.indexOf('api-key') !== -1 || code === 'auth/app-not-authorized' || code === 'auth/invalid-app-credential') {
            return t('profile.firebaseNotConfigured');
        }
        switch (code) {
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                return t('profile.passwordMismatch');
            case 'auth/weak-password':
                return t('profile.weakPassword');
            case 'auth/invalid-email':
                return t('profile.invalidEmailError');
            case 'auth/too-many-requests':
                return t('profile.tooManyAttempts');
            case 'auth/popup-blocked':
                return t('profile.popupBlocked');
            case 'auth/unauthorized-domain':
                return t('profile.unauthorizedDomain');
            case 'auth/operation-not-allowed':
                return t('profile.firebaseNotConfigured');
            default:
                console.error('Lumen: unmapped Firebase Auth error —', code, err && err.message);
                return t('profile.signInError');
        }
    }

    function updateProfileBtnDisplay() {
        const el = document.getElementById('profileBtnInner');
        if (identity.photo) { el.innerHTML = `<img src="${identity.photo}" alt="" class="profile-btn-photo">`; }
        else { el.textContent = identity.avatar || '👤'; }
    }

    // Short, honest, encouraging one-liner for the tappable banner at the top of the
    // profile — real numbers pulled from stats, never invented.
    function growthPreviewSummary() {
        if (stats.totalCompleted === 0) return t('profile.growthStoryFirst');
        const counts = {};
        stats.history.forEach(h => counts[h.goal] = (counts[h.goal] || 0) + 1);
        const topGoal = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
        const meta = topGoal ? GOAL_META[topGoal] : null;
        const days = stats.daysActive.length;
        const streak = computeStreak();
        const streakBit = streak >= 2 ? t('profile.streakBit', { n: streak }) : '';
        const ds = days === 1 ? '' : 's';
        return meta
            ? t('profile.growthWithGoal', { icon: meta.icon, n: counts[topGoal], tier: levelTier(counts[topGoal]), goal: t('goal.' + topGoal + '.label'), days: days, ds: ds, streak: streakBit })
            : t('profile.growthNoGoal', { count: stats.totalCompleted, cs: stats.totalCompleted === 1 ? '' : 's', days: days, ds: ds, streak: streakBit });
    }

    // Renders the emoji-avatar picker — a short default row, expandable via "+N more" into
    // the full AVATAR_CHOICES_MORE set, so the picker doesn't open already cluttered.
    function renderAvatarRow() {
        const row = document.getElementById('avatarRow');
        const previewImg = document.getElementById('avatarPreviewImg');
        const previewEmoji = document.getElementById('avatarPreviewEmoji');
        const list = avatarPickerExpanded ? AVATAR_CHOICES.concat(AVATAR_CHOICES_MORE) : AVATAR_CHOICES;

        const avatarButtons = list.map(av => `<button class="avatar-btn ${(!identity.photo && identity.avatar === av) ? 'selected' : ''}" data-avatar="${av}" type="button">${av}</button>`).join('');
        const toggleButton = avatarPickerExpanded
            ? `<button class="avatar-more-btn" id="avatarMoreBtn" type="button">${t('profile.showLessAvatars')}</button>`
            : `<button class="avatar-more-btn" id="avatarMoreBtn" type="button">${t('profile.moreAvatars', { n: AVATAR_CHOICES_MORE.length })}</button>`;
        row.innerHTML = avatarButtons + toggleButton;

        row.querySelectorAll('.avatar-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                identity.avatar = btn.dataset.avatar;
                identity.photo = ''; // picking an emoji swaps out any uploaded photo
                row.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                previewImg.hidden = true;
                previewEmoji.hidden = false;
                previewEmoji.textContent = identity.avatar;
            });
        });

        document.getElementById('avatarMoreBtn').addEventListener('click', () => {
            avatarPickerExpanded = !avatarPickerExpanded;
            renderAvatarRow();
        });
    }

    function renderProfileScreen() {
        const signedOutEl = document.getElementById('accountSignedOut');
        const signedInEl = document.getElementById('accountSignedIn');
        const heading = document.getElementById('profileHeading');
        const sub = document.getElementById('profileScreenSub');
        document.getElementById('profileDoneBtn').hidden = !identity.signedIn;
        document.getElementById('profileWelcomeBlock').hidden = identity.signedIn;

        if (identity.signedIn) {
            heading.textContent = t('profile.yourProfileHeading');
            sub.textContent = t('profile.yourProfileSub');
            signedOutEl.hidden = true;
            signedInEl.hidden = false;

            document.getElementById('profileNameInput').value = identity.name || '';
            document.getElementById('profileNameDisplay').textContent = identity.name || t('profile.yourProfileHeading');
            document.getElementById('profileEmailDisplay').textContent =
                identity.email || (identity.method === 'google' ? '' : t('profile.savedOnDevice'));

            const previewImg = document.getElementById('avatarPreviewImg');
            const previewEmoji = document.getElementById('avatarPreviewEmoji');
            if (identity.photo) { previewImg.src = identity.photo; previewImg.hidden = false; previewEmoji.hidden = true; }
            else { previewImg.hidden = true; previewEmoji.hidden = false; previewEmoji.textContent = identity.avatar || '🌸'; }

            renderAvatarRow();

            document.getElementById('profileStatsRow').innerHTML = `
    <div class="growth-stat"><span class="num">${stats.totalCompleted}</span><span class="lbl">${t('growth.statCompleted')}</span></div>
    <div class="growth-stat"><span class="num">${stats.daysActive.length}</span><span class="lbl">${t('growth.statDaysActive')}</span></div>
    <div class="growth-stat"><span class="num">${computeStreak()}</span><span class="lbl">${t('growth.statDayStreak')}</span></div>`;

            document.getElementById('growthPreviewText').textContent = growthPreviewSummary();
        } else {
            sub.textContent = t('profile.signInSub');
            signedOutEl.hidden = false;
            signedInEl.hidden = true;
            setAuthMode(authMode); // repaints the sign-in/sign-up tab UI (heading, button label, name field) in the current mode/language
        }
    }

    // Sign in / Sign up are one form with two modes, switched by the pair of tab chips above
    // it — rather than two separate forms — so the email/password fields, the "show password"
    // toggle, and the Google button all stay shared instead of duplicated.
    let authMode = 'signin';
    function setAuthMode(mode) {
        authMode = mode;
        document.getElementById('authModeSignIn').classList.toggle('selected', mode === 'signin');
        document.getElementById('authModeSignUp').classList.toggle('selected', mode === 'signup');
        document.getElementById('emailSignInNameWrap').hidden = (mode === 'signin');
        document.getElementById('emailSignInName').required = (mode === 'signup');
        document.getElementById('forgotPasswordBtn').hidden = (mode === 'signup');
        document.getElementById('emailSignInSubmit').textContent = t(mode === 'signup' ? 'profile.createAccountBtn' : 'profile.signInBtn');
        document.getElementById('profileHeading').textContent = t(mode === 'signup' ? 'profile.signUpHeading' : 'profile.signInHeading');
        const noteEl = document.getElementById('emailSignInNote');
        noteEl.hidden = true;
        noteEl.classList.remove('form-error');
    }
    document.getElementById('authModeSignIn').addEventListener('click', () => setAuthMode('signin'));
    document.getElementById('authModeSignUp').addEventListener('click', () => setAuthMode('signup'));

    // Runs after ANY successful sign-in (Google or email) — resumes whatever the person was
    // actually trying to do (build a path, view growth) instead of leaving them stranded on
    // a bare profile screen.
    function completeSignIn() {
        saveState();
        updateProfileBtnDisplay();
        if (pendingAfterSignIn) {
            const action = pendingAfterSignIn;
            pendingAfterSignIn = null;
            action();
        } else {
            renderProfileScreen();
        }
    }

    document.getElementById('emailSignInForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('emailSignInName').value.trim().slice(0, 24);
        const email = document.getElementById('emailSignInEmail').value.trim().toLowerCase();
        const password = document.getElementById('emailSignInPassword').value;
        const noteEl = document.getElementById('emailSignInNote');
        const submitBtn = document.getElementById('emailSignInSubmit');
        noteEl.hidden = true;
        noteEl.classList.remove('form-error');
        if (!email || !password) return;
        if (authMode === 'signup' && !name) return;
        if (!firebaseAuth) {
            noteEl.textContent = t('profile.firebaseNotConfigured');
            noteEl.classList.add('form-error');
            noteEl.hidden = false;
            return;
        }

        submitBtn.disabled = true;
        try {
            let user;
            if (authMode === 'signup') {
                user = (await createUserWithEmailAndPassword(firebaseAuth, email, password)).user;
                if (name) { try { await updateProfile(user, { displayName: name }); } catch (e) { /* non-fatal — local name still gets set below */ } }
                identity.name = name;
            } else {
                user = (await signInWithEmailAndPassword(firebaseAuth, email, password)).user;
                identity.name = identity.name || user.displayName || '';
            }

            identity.signedIn = true;
            identity.method = 'email';
            identity.email = user.email || email;
            identity.uid = user.uid;
            if (!identity.avatar && !identity.photo) identity.avatar = pick(AVATAR_CHOICES);
            completeSignIn();
        } catch (err) {
            noteEl.textContent = (authMode === 'signup' && err.code === 'auth/email-already-in-use')
                ? t('profile.emailInUse')
                : firebaseAuthErrorMessage(err);
            noteEl.classList.add('form-error');
            noteEl.hidden = false;
        } finally {
            submitBtn.disabled = false;
        }
    });

    document.getElementById('forgotPasswordBtn').addEventListener('click', async () => {
        const email = document.getElementById('emailSignInEmail').value.trim().toLowerCase();
        const noteEl = document.getElementById('emailSignInNote');
        noteEl.classList.remove('form-error');
        if (!email) {
            noteEl.textContent = t('profile.forgotNote');
            noteEl.hidden = false;
            return;
        }
        if (!firebaseAuth) {
            noteEl.textContent = t('profile.firebaseNotConfigured');
            noteEl.classList.add('form-error');
            noteEl.hidden = false;
            return;
        }
        try {
            await sendPasswordResetEmail(firebaseAuth, email);
            noteEl.textContent = t('profile.resetEmailSent');
            noteEl.hidden = false;
        } catch (err) {
            noteEl.textContent = firebaseAuthErrorMessage(err);
            noteEl.classList.add('form-error');
            noteEl.hidden = false;
        }
    });

    document.getElementById('togglePasswordBtn').addEventListener('click', () => {
        const pwInput = document.getElementById('emailSignInPassword');
        const btn = document.getElementById('togglePasswordBtn');
        const showing = pwInput.type === 'text';
        pwInput.type = showing ? 'password' : 'text';
        document.getElementById('eyeIconShow').hidden = !showing;
        document.getElementById('eyeIconHide').hidden = showing;
        btn.setAttribute('aria-label', showing ? t('profile.showPassword') : t('profile.hidePassword'));
    });

    document.getElementById('saveProfileBtn').addEventListener('click', async () => {
        identity.name = document.getElementById('profileNameInput').value.trim().slice(0, 24);
        // Keep the Firebase account's own displayName in sync too — best-effort; the local
        // profile still saves below even if this fails (offline, etc.).
        if (firebaseAuth && firebaseAuth.currentUser) {
            try { await updateProfile(firebaseAuth.currentUser, { displayName: identity.name }); } catch (e) { /* non-fatal */ }
        }
        await saveState();
        updateProfileBtnDisplay();
        showScreen(profileReturnTo || 'welcome');
    });
    document.getElementById('signOutBtn').addEventListener('click', async () => {
        if (!window.confirm(t('profile.signOutConfirm'))) return;
        if (firebaseAuth) {
            try { await signOut(firebaseAuth); } catch (e) { console.warn('Lumen: Firebase sign-out failed', e); }
        }
        identity = defaultIdentity();
        authMode = 'signin';
        await saveState();
        updateProfileBtnDisplay();
        profileReturnTo = 'welcome';
        renderProfileScreen();
        showScreen('profile');
    });
    document.getElementById('growthPreviewCard').addEventListener('click', () => {
        renderProgress();
        showScreen('progress');
    });

    // Real photo upload: reads the chosen file, downsizes it on a canvas (keeps localStorage
    // small and the avatar crisp), and stores it as a data URL — fully client-side.
    document.getElementById('avatarUploadBtn').addEventListener('click', () => {
        document.getElementById('avatarFileInput').click();
    });
    document.getElementById('changePhotoBtn').addEventListener('click', () => {
        document.getElementById('avatarFileInput').click();
    });
    document.getElementById('avatarFileInput').addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            identity.photo = await resizeImageToDataUrl(file, 200);
            await saveState();
            updateProfileBtnDisplay();
            renderProfileScreen();
        } catch (err) { console.warn('Lumen: could not read that image', err); }
    });
    function resizeImageToDataUrl(file, maxSize) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const img = new Image();
                img.onload = () => {
                    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                    const w = Math.max(1, Math.round(img.width * scale));
                    const h = Math.max(1, Math.round(img.height * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                };
                img.onerror = () => reject(new Error('Could not decode that image'));
                img.src = reader.result;
            };
            reader.onerror = () => reject(new Error('Could not read that file'));
            reader.readAsDataURL(file);
        });
    }

    document.getElementById('googleSignInBtn').addEventListener('click', async () => {
        const noteEl = document.getElementById('emailSignInNote');
        noteEl.hidden = true;
        noteEl.classList.remove('form-error');
        if (!firebaseAuth || !googleProvider) {
            noteEl.textContent = t('profile.firebaseNotConfigured');
            noteEl.classList.add('form-error');
            noteEl.hidden = false;
            return;
        }
        try {
            const user = (await signInWithPopup(firebaseAuth, googleProvider)).user;
            identity.signedIn = true;
            identity.method = 'google';
            identity.name = identity.name || user.displayName || '';
            identity.email = user.email || '';
            identity.uid = user.uid;
            if (!identity.avatar && !identity.photo) {
                if (user.photoURL) identity.photo = user.photoURL; // Google's own hosted avatar — a real URL, safe to store as-is
                else identity.avatar = '🌸';
            }
            completeSignIn();
        } catch (err) {
            if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return; // they just closed it
            noteEl.textContent = firebaseAuthErrorMessage(err);
            noteEl.classList.add('form-error');
            noteEl.hidden = false;
        }
    });

    // No account at all — just a local, device-only identity so the rest of the app (which
    // already gates on identity.signedIn) works exactly as it does for a real sign-in, minus
    // any Firebase account behind it. Honors whatever action was gated (requireSignIn) if
    // there was one; otherwise drops them straight onto the home screen, not the profile page.
    document.getElementById('continueAsGuestBtn').addEventListener('click', () => {
        identity.signedIn = true;
        identity.method = 'guest';
        if (!identity.avatar && !identity.photo) identity.avatar = pick(AVATAR_CHOICES);
        if (!pendingAfterSignIn) pendingAfterSignIn = () => showScreen('welcome');
        completeSignIn();
    });

    /* =========================================================
       16b. LANGUAGE SWITCHING
       Swaps every static [data-i18n]-marked string in the DOM, plus
       re-runs the render functions that build their own markup in
       JS (goals/time/subject/style/mood/profile), so a language
       change updates everything currently in the DOM immediately —
       not just on the next screen visit. The real content library
       (passages, recipes, video titles, etc.) is untouched by this;
       see the top of the TRANSLATIONS block for why.
    ========================================================= */
    function applyStaticTranslations() {
        document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
        document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
        document.querySelectorAll('[data-i18n-aria-label]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAriaLabel)); });
        document.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', t(el.dataset.i18nTitle)); });
        // "step N" eyebrows — composed from the translated word plus the literal number, since
        // that's simpler and just as correct as five near-duplicate translation keys.
        document.querySelectorAll('[data-step]').forEach(el => { el.textContent = t('step.prefix') + ' ' + el.dataset.step; });
    }

    function setupLangSwitcher() {
        const sel = document.getElementById('langSwitcher');
        sel.innerHTML = Object.keys(LANGUAGES).map(code => `<option value="${code}">${LANGUAGES[code].label}</option>`).join('');
        sel.addEventListener('change', () => applyLanguage(sel.value));
    }

    // Single source of truth for changing mood from anywhere (nav picker or onboarding grid) —
    // updates the live color theme and saves the pick for next time, but deliberately never
    // touches todaysPath: today's activities were already chosen for the mood at the time, and
    // silently reshuffling them out from under someone mid-day would be more surprising than
    // useful. Pick a new mood, build a new path next time, and the new mood applies there.
    function setMood(mood) {
        if (!MOOD_META[mood]) return;
        profile.mood = mood;
        document.body.setAttribute('data-mood', mood);
        const sel = document.getElementById('moodSwitcher');
        if (sel) sel.value = mood;
        crossfadeMoodAmbience(mood);
        saveState();
    }

    function setupMoodSwitcher() {
        const sel = document.getElementById('moodSwitcher');
        sel.innerHTML = Object.keys(MOOD_META).map(m => `<option value="${m}">${MOOD_META[m].icon} ${t('moodOpt.' + m + '.label')}</option>`).join('');
        sel.value = profile.mood || 'calm';
        sel.addEventListener('change', () => setMood(sel.value));
    }

    function applyLanguage(lang) {
        if (!LANGUAGES[lang]) lang = 'en';
        currentLang = lang;
        document.documentElement.lang = lang;
        document.documentElement.dir = LANGUAGES[lang].dir;
        document.getElementById('langSwitcher').value = lang;
        applyStaticTranslations();
        // Re-render whatever's JS-templated so it picks up the new language right away too.
        renderGoalsGrid();
        renderTimeScreen();
        if (pickedIdentity) renderSubjectGrid();
        if (profile.goals[0] === 'languages') renderLanguageGrid();
        renderStyleGrid();
        renderMoodGrid();
        setupMoodSwitcher(); // mood option labels are translated too — rebuild them
        setAudioToggleUI();
        if (todaysPath.length) renderPathList();
        renderProfileScreen();
        refreshDotLabels();
        saveState();
    }

    /* =========================================================
       16c. FIREBASE AUTH STATE
       Firebase persists sessions itself (browserLocalPersistence, set up
       top of file), so "stay signed in after refresh" just means: wait for
       Firebase's first onAuthStateChanged callback — which fires with the
       restored user (or null) shortly after page load — before deciding
       whether to show the sign-in screen.
    ========================================================= */
    let resolveInitialAuthCheck;
    const initialAuthCheck = new Promise((resolve) => { resolveInitialAuthCheck = resolve; });
    if (firebaseAuth) {
        onAuthStateChanged(firebaseAuth, (user) => {
            if (user) {
                identity.signedIn = true;
                identity.uid = user.uid;
                identity.email = user.email || '';
                identity.method = (user.providerData[0] && user.providerData[0].providerId === 'google.com') ? 'google' : 'email';
                if (!identity.name) identity.name = user.displayName || '';
                if (!identity.avatar && !identity.photo) {
                    if (user.photoURL) identity.photo = user.photoURL;
                    else identity.avatar = pick(AVATAR_CHOICES);
                }
            } else if (identity.signedIn && identity.method !== 'guest') {
                // The locally cached profile (from a previous visit) says signed-in, but Firebase
                // — the actual source of truth for email/google accounts — has no session. Trust
                // Firebase: a locally stale "signed in" flag shouldn't grant access on its own.
                // Guests are excluded here — they were never backed by a Firebase session to begin
                // with, so Firebase reporting "no user" is expected and not a reason to sign them out.
                identity = defaultIdentity();
                saveState();
                updateProfileBtnDisplay(); // the button was already painted once from the stale cached identity — repaint it now that identity's been reset
            }
            resolveInitialAuthCheck();
        });
    } else {
        resolveInitialAuthCheck(); // Firebase isn't configured — fall straight through to the sign-in screen
    }

    /* =========================================================
       17. INIT
    ========================================================= */
    injectLogos();
    setupLangSwitcher();
    loadState().then(async () => {
        applyLanguage(currentLang); // currentLang may have just been restored from saved state
        applyTheme(theme); // theme may have just been restored from saved state (or system preference)
        updateStreakChip();
        armAudioAutoResume(); // resumes the mood ambience on the first gesture, if it was left on
        await initialAuthCheck; // let Firebase confirm the real signed-in state before gating on it
        // A profile is mandatory — anyone not already signed in on this device lands on the
        // sign-in screen first, not the marketing homepage.
        if (!identity.signedIn) {
            profileReturnTo = 'welcome';
            renderProfileScreen();
            showScreen('profile');
        } else {
            saveState(); // persist whatever Firebase just confirmed (uid/email/method)
            updateProfileBtnDisplay();
        }
    });

})();