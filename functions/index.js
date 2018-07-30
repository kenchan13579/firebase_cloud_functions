const functions = require("firebase-functions");
const admin = require("firebase-admin");
const randomatic = require("randomatic");

admin.initializeApp();

// TODO: Remove expired codes, duplicate codes
exports.generateFamilyCode = functions.https.onCall((data, context) => {
  const { familyId } = data;
  const code = randomatic("0", 6);
  const d = new Date();
  d.setDate(d.getDate() + 1);
  if (familyId === undefined) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "familyId is required"
    );
  }
  return admin
    .firestore()
    .collection("invite_codes")
    .add({
      family_id: familyId,
      code,
      expired_date: d
    })
    .then(() => ({ code }))
    .catch(err => res.status(500).end(err));
});

exports.pushNewFeedsToFamilyMembers = functions.firestore
  .document("/posts/{familyId}")
  .onUpdate((change, context) => {
    const { familyId } = context.params;
    const newValue = change.after.data();
    const previousValue = change.before.data();
    const newPostIds = [];
    for (const newId in newValue) {
      if (previousValue[newId] === undefined) {
        newPostIds.push(newId);
      }
    }
    if (newPostIds.length === 0) {
      return Promise.resolve("no new post created");
    }

    console.log("new post id ->", newPostIds);
    const getPostData = admin
      .firestore()
      .doc(`/posts-data/${newPostIds[0]}`)
      .get();
    const getFamilyMembers = admin
      .firestore()
      .doc(`/families/${familyId}`)
      .get();

    return Promise.all([getPostData, getFamilyMembers])
      .then(([postData, familyData]) => {
        if (!postData || !postData.exists) {
          return Promise.reject(new Error("post data couldn't be fetched"));
        }
        if (!familyData || !familyData.exists) {
          return Promise.reject(new Error("family data not fetched"));
        }

        const authorId = postData.get("author");
        const members = Object.keys(familyData.get("members") || {}).reduce(
          (ret, id) => [...ret, id],
          []
        );
        const userRequests = members.map(id =>
          admin
            .firestore()
            .doc(`/users/${id}`)
            .get()
        );
        return Promise.all([authorId, ...userRequests]);
      })
      .then(([authorId, ...result]) => {
        let authorName = "";
        const tokens = [];
        for (let i = 0; i < result.length; i++) {
          if (result[i].exists) {
            const userId = result[i].id;
            const fcmToken = result[i].get("fcmToken");
            if (userId === authorId) {
              authorName = result[i].get("name");
            } else if (fcmToken) {
              tokens.push(fcmToken);
            }
          }
        }
        const payload = {
          notification: {
            title: "New feed",
            body: `${authorName} has a new feed`
          }
        };

        return admin.messaging().sendToDevice(tokens, payload);
      })
      .catch(error => console.log("error", error));
  });
