const functions = require('firebase-functions');
const admin = require('firebase-admin');
const randomatic = require('randomatic');
admin.initializeApp();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });


// TODO: Remove expired codes, duplicate codes
exports.generateFamilyCode = functions.https.onRequest((req, res) => {
    const {familyId} = req.query;
    const code = randomatic('0', 6);
    const d = new Date();
    d.setDate(d.getDate() + 1);
    if (familyId === undefined) {
        throw new functions.https.HttpsError('invalid-argument', 'familyId is required')
    }
    return admin.firestore().collection('invite_codes').add({
        family_id: familyId,
        code,
        expired_date: d
    }).then(() => res.json({code}))
    .catch(err => res.status(500).end(err))
})
