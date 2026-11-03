/**
 * Om Team Register: default settings and screen words.
 * These are copied into the "Settings & words" tab on setup. Admins change wording there;
 * the tab always wins over the defaults below.
 */

var DEFAULT_SETTINGS = {
  'setting.orgName': ['Om Textiles', 'Name shown at the top of the app'],
  'setting.maxPinTries': ['5', 'Wrong PINs before a login is locked'],
  'setting.lockMinutes': ['15', 'Minutes a locked login stays locked'],
  'setting.sessionHours': ['12', 'Hours before people have to sign in again'],
  'setting.alertAdmins': ['yes', 'Email admins about new joiners and locked logins (yes / no)'],
  'setting.signinUrl': ['', 'Filled by Om Team > Connect Google sign-in']
};

var DEFAULT_WORDS = {
  'word.employee': ['Employee', 'कर्मचारी'],
  'word.teamLead': ['Team lead', 'टीम लीडर'],
  'app.signIn': ['Sign in', 'लॉग इन करें'],
  'app.signOut': ['Sign out', 'लॉग आउट'],
  'app.mobile': ['Mobile number', 'मोबाइल नंबर'],
  'app.pin': ['4-digit PIN', '4 अंकों का पिन'],
  'app.google': ['Sign in with Google', 'Google से लॉग इन करें'],
  'app.or': ['or', 'या'],
  'app.join': ['New here? Fill the joining form', 'नए हैं? जॉइनिंग फॉर्म भरें'],
  'app.wait': ['Please wait…', 'कृपया रुकें…'],
  'app.back': ['Back', 'वापस'],
  'app.next': ['Next', 'आगे'],
  'app.save': ['Save', 'सेव करें'],
  'app.send': ['Send', 'भेजें'],
  'app.cancel': ['Cancel', 'रद्द करें'],
  'app.done': ['Done', 'हो गया'],
  'app.optional': ['optional', 'ज़रूरी नहीं'],
  'app.speak': ['Speak', 'बोलें'],
  'app.listening': ['Listening… speak now', 'सुन रहे हैं… अब बोलें'],
  'app.micHelp': ['Voice is not working here. Tap the mic key on your keyboard instead.', 'यहाँ आवाज़ काम नहीं कर रही। कीबोर्ड पर माइक बटन दबाएँ।'],
  'app.hello': ['Namaste', 'नमस्ते'],
  'app.changePin': ['Change PIN', 'पिन बदलें'],
  'app.oldPin': ['Current PIN', 'अभी का पिन'],
  'app.newPin': ['New 4-digit PIN', 'नया 4 अंकों का पिन'],
  'app.newPin2': ['New PIN again', 'नया पिन दोबारा'],
  'app.pinChanged': ['PIN changed', 'पिन बदल गया'],
  'app.mustChangePin': ['Please set your own PIN first', 'पहले अपना पिन बनाएँ'],
  'app.adminPin': ['Admin PIN', 'एडमिन पिन'],
  'home.today': ['Today', 'आज की हाज़िरी'],
  'home.todaySoon': ['Attendance is coming soon', 'हाज़िरी जल्द आ रही है'],
  'home.details': ['My details', 'मेरी जानकारी'],
  'home.money': ['My money', 'मेरा पैसा'],
  'home.team': ['My team', 'मेरी टीम'],
  'home.problem': ['Report a problem', 'समस्या बताएँ'],
  'home.requests': ['My requests', 'मेरे अनुरोध'],
  'home.soon': ['Coming soon', 'जल्द आ रहा है'],
  'home.admin': ['Admin', 'एडमिन'],
  'details.change': ['Change', 'बदलें'],
  'details.changeHelp': ['Your change goes to the admin. It shows here after approval.', 'आपका बदलाव एडमिन के पास जाएगा। मंज़ूरी के बाद यहाँ दिखेगा।'],
  'details.newValue': ['New value', 'नई जानकारी'],
  'details.note': ['Note for admin', 'एडमिन के लिए संदेश'],
  'details.sent': ['Sent to admin', 'एडमिन को भेज दिया'],
  'details.pending': ['Waiting for admin', 'एडमिन की मंज़ूरी बाकी'],
  'details.photoTake': ['Take or choose photo', 'फ़ोटो लें या चुनें'],
  'field.Full name': ['Full name', 'पूरा नाम'],
  'field.Display name': ['Team name', 'टीम का नाम'],
  'field.DOB': ['Date of birth', 'जन्म तिथि'],
  'field.Designation': ['Designation', 'पद'],
  'field.Department': ['Department', 'विभाग'],
  'field.Email': ['Email', 'ईमेल'],
  'field.Mobile 1': ['Mobile 1 (for login)', 'मोबाइल 1 (लॉग इन के लिए)'],
  'field.Mobile 2': ['Mobile 2', 'मोबाइल 2'],
  'field.Mobile 3': ['Mobile 3', 'मोबाइल 3'],
  'field.Emergency mobile': ['Emergency number', 'आपातकालीन नंबर'],
  'field.Emergency contact name': ['Emergency contact name', 'आपातकालीन संपर्क का नाम'],
  'field.Emergency relation': ['Relation', 'रिश्ता'],
  'field.Address': ['Address', 'पता'],
  'field.Joining date': ['Joining date', 'जॉइनिंग की तारीख'],
  'field.Aadhaar': ['Aadhaar number', 'आधार नंबर'],
  'field.PAN': ['PAN', 'पैन'],
  'field.Bank account': ['Bank account number', 'बैंक खाता नंबर'],
  'field.IFSC': ['IFSC code', 'IFSC कोड'],
  'field.Account holder': ['Account holder name', 'खाताधारक का नाम'],
  'field.Photo': ['Your photo', 'आपकी फ़ोटो'],
  'field.Aadhaar photo': ['Aadhaar card photo', 'आधार कार्ड की फ़ोटो'],
  'field.PAN photo': ['PAN card photo', 'पैन कार्ड की फ़ोटो'],
  'field.Language': ['Language', 'भाषा'],
  'field.Type': ['I am joining as', 'मैं जुड़ रहा/रही हूँ'],
  'field.isEmergency': ['This is the emergency number', 'यह आपातकालीन नंबर है'],
  'join.title': ['Joining form', 'जॉइनिंग फॉर्म'],
  'join.step1': ['About you', 'आपके बारे में'],
  'join.step2': ['Phone numbers', 'फ़ोन नंबर'],
  'join.step3': ['Address and joining', 'पता और जॉइनिंग'],
  'join.step4': ['Aadhaar, PAN and bank', 'आधार, पैन और बैंक'],
  'join.step5': ['Photos', 'फ़ोटो'],
  'join.step6': ['PIN and consent', 'पिन और सहमति'],
  'join.teamNameHelp': ['For example: Chotu Tailor Team, or just your name if you work alone', 'जैसे: छोटू टेलर टीम, या अकेले काम करते हैं तो अपना नाम'],
  'join.consent': ['I agree that Om Textiles may keep my Aadhaar, PAN, bank details and photos for work records.', 'मैं सहमत हूँ कि ओम टेक्सटाइल्स मेरा आधार, पैन, बैंक जानकारी और फ़ोटो काम के रिकॉर्ड के लिए रख सकता है।'],
  'join.thanks': ['Thank you. The admin will check your details. You can sign in after approval.', 'धन्यवाद। एडमिन आपकी जानकारी जाँचेंगे। मंज़ूरी के बाद आप लॉग इन कर सकते हैं।'],
  'join.badLink': ['This joining link is not valid any more. Ask the admin for a new one.', 'यह जॉइनिंग लिंक अब मान्य नहीं है। एडमिन से नया लिंक माँगें।'],
  'team.members': ['Team members', 'टीम के सदस्य'],
  'team.add': ['Add a member', 'सदस्य जोड़ें'],
  'team.remove': ['Remove', 'हटाएँ'],
  'team.name': ['Member name', 'सदस्य का नाम'],
  'team.skill': ['Work / skill', 'काम / हुनर'],
  'team.none': ['No members yet', 'अभी कोई सदस्य नहीं'],
  'problem.what': ['What is wrong?', 'क्या गलत है?'],
  'problem.when': ['Which date or month?', 'कौन सी तारीख या महीना?'],
  'problem.note': ['Tell us what happened', 'बताइए क्या हुआ'],
  'about.My details': ['My details', 'मेरी जानकारी'],
  'about.My team': ['My team', 'मेरी टीम'],
  'about.Attendance': ['Attendance', 'हाज़िरी'],
  'about.Salary': ['Salary', 'तनख्वाह'],
  'about.Advance': ['Advance', 'एडवांस'],
  'about.Other': ['Something else', 'कुछ और'],
  'status.Open': ['Waiting', 'बाकी'],
  'status.Approved': ['Approved', 'मंज़ूर'],
  'status.Rejected': ['Not approved', 'नामंज़ूर'],
  'req.none': ['No requests yet', 'अभी कोई अनुरोध नहीं'],
  'req.reply': ['Admin reply', 'एडमिन का जवाब'],
  'err.mobile': ['Enter a 10-digit mobile number', '10 अंकों का मोबाइल नंबर डालें'],
  'err.pin': ['PIN must be 4 digits', 'पिन 4 अंकों का होना चाहिए'],
  'err.pinMatch': ['The two PINs do not match', 'दोनों पिन एक जैसे नहीं हैं'],
  'err.aadhaar': ['This Aadhaar number is not correct', 'यह आधार नंबर सही नहीं है'],
  'err.pan': ['PAN looks like ABCDE1234F', 'पैन ऐसा होता है: ABCDE1234F'],
  'err.ifsc': ['IFSC looks like SBIN0001234', 'IFSC ऐसा होता है: SBIN0001234'],
  'err.email': ['This email is not correct', 'यह ईमेल सही नहीं है'],
  'err.required': ['Please fill this', 'कृपया यह भरें'],
  'err.consent': ['Please tick the consent box', 'कृपया सहमति वाले बॉक्स पर टिक करें'],
  'err.mobileTaken': ['This mobile number is already registered', 'यह मोबाइल नंबर पहले से दर्ज है'],
  'err.replyNeeded': ['Write a short reply when not approving', 'नामंज़ूर करते समय छोटा जवाब लिखें'],
  'err.signin': ['Please sign in again', 'कृपया फिर से लॉग इन करें'],
  'err.locked': ['Too many wrong PINs. Try again after some time or ask the admin.', 'बहुत बार गलत पिन। कुछ देर बाद कोशिश करें या एडमिन से पूछें।'],
  'err.badLogin': ['Mobile number or PIN is wrong', 'मोबाइल नंबर या पिन गलत है'],
  'err.pending': ['Your details are waiting for admin approval', 'आपकी जानकारी एडमिन की मंज़ूरी के लिए बाकी है'],
  'err.inactive': ['This login is not active. Ask the admin.', 'यह लॉग इन चालू नहीं है। एडमिन से पूछें।'],
  'err.noGmail': ['This Google account is not linked to anyone. Use mobile and PIN, or ask the admin.', 'यह Google खाता किसी से जुड़ा नहीं है। मोबाइल और पिन से लॉग इन करें या एडमिन से पूछें।'],
  'err.noAdminPin': ['Set your admin PIN from the sheet menu first: Om Team > Set my admin PIN', 'पहले शीट मेनू से एडमिन पिन बनाएँ: Om Team > Set my admin PIN'],
  'err.already': ['Someone already handled this', 'इसे पहले ही किसी ने देख लिया है'],
  'err.generic': ['Something went wrong. Please try again.', 'कुछ गड़बड़ हुई। फिर से कोशिश करें।']
};

/** Words for both languages plus public settings, read from the tab with defaults underneath. */
function loadWords_() {
  var words = { en: {}, hi: {} };
  Object.keys(DEFAULT_WORDS).forEach(function (k) {
    words.en[k] = DEFAULT_WORDS[k][0];
    words.hi[k] = DEFAULT_WORDS[k][1];
  });
  var settings = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (k) { settings[k] = DEFAULT_SETTINGS[k][0]; });
  readTable_(TABS.WORDS).forEach(function (r) {
    var k = String(r['Key']);
    var en = String(r['English / value']);
    if (k.indexOf('setting.') === 0) { settings[k] = en; return; }
    if (en) words.en[k] = en;
    if (String(r['Hindi'])) words.hi[k] = String(r['Hindi']);
  });
  return { words: words, settings: settings };
}

function setting_(key) {
  return loadWords_().settings['setting.' + key];
}
