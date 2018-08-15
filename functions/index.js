const functions = require("firebase-functions");
const admin = require("firebase-admin");
const randomatic = require("randomatic");

admin.initializeApp();
const COLLECTION_NAMES = {
  CHATS: "chats",

  FAMILIES: "families",

  POST_COMMENT: "post-comment",

  POST_IDS: "posts",

  POSTS_DATA: "posts-data",

  USERS: "users"
};

exports.generateFamilyCode = functions.https.onCall((data, context) => {
  const { familyId } = data;
  const { uid } = context.auth;

  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "not authroized");
  }
  if (familyId === undefined) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "familyId is required"
    );
  }
  return admin
    .firestore()
    .doc(`/families/${familyId}`)
    .get()
    .then(familyData => {
      if (!familyData || !familyData.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "family doesn't exist"
        );
      }
      const existingCode = familyData.get("invite_code");
      const existingCodeExpiredTime = familyData.get("invite_code_expired");
      const now = familyData.readTime.toDate().getTime();
      let promises = [];
      if (
        existingCode &&
        (existingCodeExpiredTime && now <= existingCodeExpiredTime)
      ) {
        let response = { code: existingCode };
        promises.push(response);
      } else {
        const code = randomatic("0", 6);
        const d = familyData.readTime.toDate();
        d.setDate(d.getDate() + 1);
        const saveCodeToDB = familyData.ref.set(
          {
            invite_code: code,
            invite_code_expired: d.getTime()
          },
          { merge: true }
        );
        promises = [{ code }, saveCodeToDB];
      }
      return Promise.all(promises);
    })
    .then(([result]) => result)
    .catch(err => {
      throw new functions.https.HttpsError(err.code, err.message, err.details);
    });
});
exports.pushOnNewEmotion = functions.firestore
  .document(`/${COLLECTION_NAMES.POSTS_DATA}/{postId}`)
  .onUpdate((change, context) => {
    const newValue = change.after.data();
    const previousValue = change.before.data();
    console.log(newValue, previousValue);
    if (!newValue.comments && !previousValue.comments) {
      return Promise.resolve();
    }
    if (
      newValue.comments &&
      previousValue.comments &&
      Object.keys(newValue.comments).length <=
        Object.keys(previousValue.comments).length
    ) {
      return Promise.resolve();
    }
    let newCommentId = Object.keys(newValue.comments).filter(
      id => !previousValue.comments || !previousValue.comments[id]
    )[0];
    console.log(newCommentId, "newcomid");
    let getPostAuthor = admin
      .firestore()
      .doc(`/${COLLECTION_NAMES.USERS}/${newValue.author}`)
      .get();
    let getComment = admin
      .firestore()
      .doc(`/${COLLECTION_NAMES.POST_COMMENT}/${newCommentId}`)
      .get();
    return Promise.all([getPostAuthor, getComment])
      .then(([postAuthor, commentData]) => {
        if (!postAuthor || !postAuthor.exists) {
          return Promise.reject(new Error("post author couldn't be fetched"));
        }
        if (!commentData || !commentData.exists) {
          return Promise.reject(new Error("comment data not fetched"));
        }
        let commentAuthorId = commentData.get("authorID");
        let getCommentAuthor = admin
          .firestore()
          .doc(`/${COLLECTION_NAMES.USERS}/${commentAuthorId}`)
          .get();
        return Promise.all([postAuthor, commentData, getCommentAuthor]);
      })
      .then(([postAuthor, commentData, commentAuthorData]) => {
        if (!commentAuthorData || !commentAuthorData.exists) {
          return Promise.reject(
            new Error("comment author couldn't be fetched")
          );
        }
        const commentAuthorName = getFirstName(commentAuthorData.get("name"));
        const commentText = commentData.get("text");
        const payload = {
          notification: {
            title: `${commentAuthorName} posted a comment on your feed`,
            body: `"${commentText}"`
          }
        };
        console.log("author", postAuthor.get("fcmToken"));
        console.log(payload);

        return admin
          .messaging()
          .sendToDevice([postAuthor.get("fcmToken")], payload);
      });
  });
exports.pushOnNewComment = functions.firestore
  .document(`/${COLLECTION_NAMES.POSTS_DATA}/{postId}`)
  .onUpdate((change, context) => {
    const newValue = change.after.data();
    const previousValue = change.before.data();
    console.log(newValue, previousValue);
    if (!newValue.comments && !previousValue.comments) {
      return Promise.resolve();
    }
    if (
      newValue.comments &&
      previousValue.comments &&
      Object.keys(newValue.comments).length <=
        Object.keys(previousValue.comments).length
    ) {
      return Promise.resolve();
    }
    let newCommentId = Object.keys(newValue.comments).filter(
      id => !previousValue.comments || !previousValue.comments[id]
    )[0];
    console.log(newCommentId, "newcomid");
    let getPostAuthor = admin
      .firestore()
      .doc(`/${COLLECTION_NAMES.USERS}/${newValue.author}`)
      .get();
    let getComment = admin
      .firestore()
      .doc(`/${COLLECTION_NAMES.POST_COMMENT}/${newCommentId}`)
      .get();
    return Promise.all([getPostAuthor, getComment])
      .then(([postAuthor, commentData]) => {
        if (!postAuthor || !postAuthor.exists) {
          return Promise.reject(new Error("post author couldn't be fetched"));
        }
        if (!commentData || !commentData.exists) {
          return Promise.reject(new Error("comment data not fetched"));
        }
        let commentAuthorId = commentData.get("authorID");
        let getCommentAuthor = admin
          .firestore()
          .doc(`/${COLLECTION_NAMES.USERS}/${commentAuthorId}`)
          .get();
        return Promise.all([postAuthor, commentData, getCommentAuthor]);
      })
      .then(([postAuthor, commentData, commentAuthorData]) => {
        if (!commentAuthorData || !commentAuthorData.exists) {
          return Promise.reject(
            new Error("comment author couldn't be fetched")
          );
        }
        const commentAuthorName = getFirstName(commentAuthorData.get("name"));
        const commentText = commentData.get("text");
        const payload = {
          notification: {
            title: `${commentAuthorName} posted a comment on your feed`,
            body: `"${commentText}"`
          }
        };
        console.log("author", postAuthor.get("fcmToken"));
        console.log(payload);

        return admin
          .messaging()
          .sendToDevice([postAuthor.get("fcmToken")], payload);
      });
  });

/**
 *
 * @param {string} name
 * @return {string}
 */
function getFirstName(name = "") {
  return name.split(" ")[0] || "User";
}

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

    const getPostData = admin
      .firestore()
      .doc(`/${COLLECTION_NAMES.POSTS_DATA}/${newPostIds[0]}`)
      .get();
    const getFamilyMembers = admin
      .firestore()
      .doc(`/${COLLECTION_NAMES.FAMILIES}/${familyId}`)
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
            .doc(`/${COLLECTION_NAMES.USERS}/${id}`)
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
