/**
 * إعدادات المنصة المركزية — Feature Flags وحدود النظام
 * لا يعتمد على DOM أو Firebase أو حالة S
 */

/** كتالوج الميزات القابلة للفتح/القفل من لوحة الأدمن (config/features) */
export const FEATURE_CATALOG = [
  ["chat", "💬 التواصل (شات وجروبات)"],
  ["calls", "📞 المكالمات"],
  ["games", "🎮 الألعاب"],
  ["fadaye7", "😂 الفضائح"],
  ["tanagha", "💗 التناغه"],
  ["books", "📚 الكتب"],
  ["asms", "📝 التقييمات"],
  ["ai", "🤖 المساعد 么"],
  ["life", "🛒 المتجر والحيوان"],
  ["progress", "📊 تقدمي ولوحة الشرف"],
  ["subjects", "📚 المواد والامتحانات"]
];

export const FEATURE_KEYS = FEATURE_CATALOG.map(([k]) => k);

/** حدود القراءة الافتراضية (Firestore) */
export const LIMITS = {
  fadPage: 20,
  fadMax: 1500,
  leaderboard: 40,
  chatsList: 40,
  booksPdfMaxBytes: 900 * 1024,
  modeHtmlMaxBytes: 600000,
  errorLogKeepDays: 14,
  studentsTablePage: 40,
  toastMs: 2500,
  adminExams: 400,
  adminStudents: 500,
  adminPresence: 400,
  adminStarts: 150,
  adminRooms: 100,
  adminAssessments: 300,
  adminGalleries: 800,
  studentGalleries: 400
};

/** أسماء مجموعات Firestore الأساسية (مرجع للتوثيق والصيانة) */
export const COLLECTIONS = {
  students: "students",
  studentsPrivate: "studentsPrivate",
  publicProfiles: "publicProfiles",
  exams: "exams",
  results: "results",
  conversations: "conversations",
  groups: "groups",
  fadaye7: "fadaye7",
  galleries: "galleries",
  books: "books",
  assessments: "assessments",
  leaderboard: "leaderboard",
  config: "config",
  errorLogs: "errorLogs",
  perfLogs: "perfLogs",
  life: "life",
  qbRooms: "qb_rooms"
};

/** مسارات إعدادات config/* */
export const CONFIG_DOCS = {
  site: "site",
  features: "features",
  ai: "ai",
  tester: "tester"
};
