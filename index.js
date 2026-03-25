const firebaseConfig = {

apiKey: "AIzaSyAPkty7Rrb9dXk6Zl7cgPtboS8_cuUZ27E",
authDomain: "chatting-app-319c5.firebaseapp.com",
projectId: "chatting-app-319c5",
messagingSenderId: "829874676616",
appId: "1:829874676616:web:fc7b7f307f3273c798503d",
measurementId: "G-PKBB5KFPL3"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
let user = null;
let selectedUser = null;
let messageListenerUnsubscribe = null;
let recentChatListenerUnsubscribe = null;
let userStatusListenerUnsubscribe = null;
let chatMessageListenerUnsubscribe = null;

 

let typingListenerUnsubscribe = null;

 

const DEFAULT_PHOTO_URL = 'https://via.placeholder.com/100';

 

 

 

// Global E2EE state

 

let userDecryptionKey = null;

 

const HASH_ALGO = 'SHA-256';

 

const KDF_SALT = new Uint8Array([11, 22, 33, 44, 55, 66, 77, 88]);

 

let isLoginMode = true;

 

let typingTimeout = null;

 

 

 

// ====================================================================

 

// HELPER FUNCTIONS 🛠️

 

// ====================================================================

 

 

 

// Utility functions for Base64 <-> ArrayBuffer conversion

 

function arrayBufferToBase64(buffer) {

 

 let binary = '';

 

 const bytes = new Uint8Array(buffer);

 

 for (let i = 0; i < bytes.byteLength; i++) {

 

     binary += String.fromCharCode(bytes[i]);

 

 }

 

 return btoa(binary);

 

}

 

 

 

function base64ToArrayBuffer(base64) {

 

 const binary_string = atob(base64);

 

 const len = binary_string.length;

 

 const bytes = new Uint8Array(len);

 

 for (let i = 0; i < len; i++) {

 

     bytes[i] = binary_string.charCodeAt(i);

 

 }

 

 return bytes.buffer;

 

}

// -------------------------

// Blocking helpers

// -------------------------

// Returns true if `ownerId` has blocked `otherId`

async function hasBlocked(ownerId, otherId) {

   try {

       const doc = await db.collection('userBlocks').doc(ownerId).collection('blocked').doc(otherId).get();

       return doc.exists;

   } catch (e) {

       console.error('hasBlocked check failed', e);

       return false;

   }

}

 

// Toggle block/unblock for the currently selected user

async function toggleBlock() {

   if (!user || !selectedUser) return;

   const blockRef = db.collection('userBlocks').doc(user.uid).collection('blocked').doc(selectedUser.id);

   try {

       const doc = await blockRef.get();

       if (doc.exists) {

           await blockRef.delete();

           alert('User unblocked');

       } else {

           await blockRef.set({ blockedAt: firebase.firestore.FieldValue.serverTimestamp() });

           alert('User blocked');

       }

       updateBlockUI();

   } catch (e) {

       console.error('toggleBlock failed', e);

       alert('Failed to update block status');

   }

}

 

// Update block button text and disable send UI if we're blocked by the selected user

// Format last seen timestamp with day and time
function formatLastSeen(timestamp) {
    if (!timestamp) return 'Offline';
    
    const lastSeenDate = new Date(timestamp.toDate ? timestamp.toDate() : timestamp);
    const now = new Date();
    const diffMs = now - lastSeenDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    // Less than 1 minute
    if (diffMins < 1) return 'Just now';
    
    // Less than 1 hour
    if (diffMins < 60) return `${diffMins}m ago`;
    
    // Less than 24 hours
    if (diffHours < 24) return `${diffHours}h ago`;
    
    // More than a day - show day and time
    if (diffDays < 7) {
        const timeStr = lastSeenDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        const dayStr = lastSeenDate.toLocaleDateString('en-US', { weekday: 'short' });
        return `${dayStr} at ${timeStr}`;
    }
    
    // More than a week - show full date and time
    const timeStr = lastSeenDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const dateStr = lastSeenDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${dateStr} at ${timeStr}`;
}

async function updateBlockUI() {

   const blockBtn = document.getElementById('block-button');

   const sendBtn = document.getElementById('send-button');

   const input = document.getElementById('message-input');

   const lastSeenEl = document.getElementById('last-seen-text');

   if (!blockBtn) return;

   if (!user || !selectedUser) {

       blockBtn.style.display = 'none';

       if (sendBtn) sendBtn.disabled = true;

       if (input) input.disabled = true;

       if (lastSeenEl) lastSeenEl.textContent = '';

       return;

   }

 

   blockBtn.style.display = 'inline-block';

   // Update last seen display
   if (lastSeenEl) {
       if (selectedUser.isOnline) {
           lastSeenEl.textContent = 'Online';
       } else {
           lastSeenEl.textContent = formatLastSeen(selectedUser.lastSeen);
       }
   }

   try {

       const iBlocked = await hasBlocked(user.uid, selectedUser.id);

       const iAmBlocked = await hasBlocked(selectedUser.id, user.uid);

 

       blockBtn.textContent = iBlocked ? 'Unblock' : 'Block';

 

       if (iAmBlocked) {

           if (sendBtn) sendBtn.disabled = true;

           if (input) {

               input.disabled = true;

               input.placeholder = 'You are blocked by this user';

           }

       } else {

           if (sendBtn) sendBtn.disabled = false;

           if (input) {

               input.disabled = false;

               input.placeholder = 'Type a message...';

           }

       }

   } catch (e) {

       console.error('updateBlockUI failed', e);

   }

}

 

 

 

 

// Validation and Profile helpers

 

function isValidUsername(username) {

 

 // Check length (3-15 characters)

 

 if (!username || username.length < 3 || username.length > 15) {

 

     return false;

 

 }

 

 

 

 // Check characters (a-z, A-Z, 0-9, dot, underscore)

 

 const regex = /^[a-zA-Z0-9._]+$/;

 

 return regex.test(username);

 

}

 

 

 

async function checkUsernameAvailability(username) {

 

 // Returns TRUE if available, FALSE if taken or invalid format.

 

 

 

 // 1. Check Format First

 

 if (!isValidUsername(username)) {

 

     // If the format is invalid, return false (unavailable).

 

     return false;

 

 }

 

 

 

 // 2. Query Firestore

 

 const usernameDoc = await db.collection('usernames').doc(username).get();

 

 

 

 // 3. Return the REVERSE of existence:

 

 // If usernameDoc.exists is TRUE (Username is TAKEN) -> return FALSE (Unavailable)

 

   // If usernameDoc.exists is FALSE (Username is AVAILABLE) -> return TRUE (Available)

 

   return !usernameDoc.exists;

 

}

 

function scrollToBottom(immediate = false) {

 

   const messagesDiv = document.getElementById('messages');

 

   if (!messagesDiv) return;

 

   const last = messagesDiv.lastElementChild;

 

   // If immediate requested, jump without animation

   if (immediate) {

       messagesDiv.scrollTop = messagesDiv.scrollHeight;

       return;

   }

 

   try {

       if (last && last.scrollIntoView) {

           last.scrollIntoView({ behavior: 'smooth', block: 'end' });

       } else if (messagesDiv.scrollTo) {

           messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' });

       } else {

           messagesDiv.scrollTop = messagesDiv.scrollHeight;

       }

   } catch (e) {

       messagesDiv.scrollTop = messagesDiv.scrollHeight;

   }

 

}

 

// -----------------------------------------------------------------------------

// Image sending helpers

// - Selected image is stored in sessionStorage as Base64 under key 'pendingImage'

// - Displayed locally in the pending preview area until sent

// - Cleared when sent or when the browser tab/window is closed

// -----------------------------------------------------------------------------

 

// Read image file, convert to Base64 and store in sessionStorage

function handleImageSelect(file) {

   if (!file) return;

 

   // Only accept image files

   if (!file.type.startsWith('image/')) {

       alert('Please select an image file.');

       return;

   }

 

   const reader = new FileReader();

   // When reading completes, store the data URL in sessionStorage and update preview

   reader.onload = function (e) {

       const base64 = e.target.result; // data:image/...;base64,...

       try {

           sessionStorage.setItem('pendingImage', base64);

       } catch (err) {

           console.error('Unable to store image in sessionStorage:', err);

       }

       displayPendingImage();

   };

   reader.readAsDataURL(file);

}

 

// Display the pending image (if any) in the preview area

function displayPendingImage() {

   const previewEl = document.getElementById('pending-image-preview');

   if (!previewEl) return;

   const base64 = sessionStorage.getItem('pendingImage');

   if (!base64) {

       previewEl.innerHTML = '';

       previewEl.style.display = 'none';

       return;

   }

 

   // Create an img and a remove button

   previewEl.innerHTML = '';

   const img = document.createElement('img');

   img.src = base64;

   img.className = 'message-image';

   img.alt = 'Pending image';

   img.style.maxWidth = '180px';

   img.style.borderRadius = '8px';

 

   const removeBtn = document.createElement('button');

   removeBtn.textContent = 'Remove';

   removeBtn.style.marginLeft = '8px';

   removeBtn.onclick = () => {

       sessionStorage.removeItem('pendingImage');

       displayPendingImage();

       // Clear the file input value

       const fileInput = document.getElementById('image-input');

       if (fileInput) fileInput.value = '';

   };

 

   previewEl.appendChild(img);

   previewEl.appendChild(removeBtn);

   previewEl.style.display = 'block';

}

 

// Ensure pending image is removed when tab is closed

window.addEventListener('beforeunload', () => {

   try { sessionStorage.removeItem('pendingImage'); } catch (e) { /* ignore */ }

});

 

// Attach change handler for the image input if present

document.addEventListener('DOMContentLoaded', () => {

   const imageInput = document.getElementById('image-input');

   if (imageInput) {

       imageInput.addEventListener('change', (ev) => {

           const file = ev.target.files && ev.target.files[0];

           handleImageSelect(file);

       });

   }

   // Show preview if a pending image already exists in this session

   displayPendingImage();

});

 

 

 

function convertGoogleDriveLink(shareLink) {

 

 const driveFileIdRegex = /(?:https?:\/\/(?:www\.)?drive\.google\.com\/(?:file\/d\/|open\?id=))([a-zA-Z0-9_-]+)/;

 

 const match = shareLink.match(driveFileIdRegex);

 

 if (match && match[1]) {

 

     return `https://drive.google.com/uc?export=view&id=${match[1]}`;

 

 }

 

 return shareLink;

 

}

 

 

 

async function createUserProfile(user, username, photoURL, name) {

 

 const userRef = db.collection('users').doc(user.uid);

 

 const batch = db.batch();

 

 

 

 batch.set(userRef, {

 

     username: username,

 

     name: name,

 

     photoURL: photoURL,

 

     isOnline: true,

 

     lastSeen: firebase.firestore.FieldValue.serverTimestamp(),

 

 }, { merge: true });

 

 

 

 batch.set(db.collection('usernames').doc(username), { uid: user.uid });

 

 

 

 await batch.commit();

 

}

 

async function sendVerificationEmail() {

 

 if (user && !user.emailVerified) {

 

     try {

 

         await user.sendEmailVerification();

 

         alert("Verification email sent! Please check your inbox.");

 

     } catch (error) {

 

         console.error("Error sending verification email:", error);

 

   // If messages area exists, ensure it jumps to bottom after search navigation

   scrollToBottom(true);

 

     }

 

 } else {

 

     alert("You must be logged in with an unverified account to resend the email.");

 

 }

 

}

 

// Add this function definition to your JS file, preferably with your other Auth functions.

 

 

 

async function sendPasswordReset() {

 

 const emailInput = document.getElementById('email-input');

 

 const email = emailInput ? emailInput.value.trim() : '';

 

 

 

 if (!email) {

 

     alert("Please enter your email address in the Email field before clicking 'Forgot Password'.");

 

     return;

 

 }

 

 

 

 try {

 

     await auth.sendPasswordResetEmail(email);

 

     alert(`A password reset link has been sent to ${email}. Check your inbox.`);

 

 } catch (error) {

 

     console.error("Password Reset Error:", error);

 

     alert("Failed to send password reset email: " + error.message);

 

 }

 

}

 

// ====================================================================

 

// E2EE CRYPTOGRAPHY FUNCTIONS 🔒

 

// ====================================================================

 

 

 async function generateAndStoreKeys(password) {
    console.log("Generating E2EE keys...");
 const keyPair = await window.crypto.subtle.generateKey(
  { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([0x01, 0x00, 0x01]), hash: HASH_ALGO },
     true,
   ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
 );

const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey);
 const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey);
 const passwordKey = await window.crypto.subtle.importKey(
     "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
 );
 const encryptionKey = await window.crypto.subtle.deriveKey(
     { name: "PBKDF2", salt: KDF_SALT, iterations: 100000, hash: HASH_ALGO },
    passwordKey,
    { name: "AES-GCM", length: 256 },
  true, // extractable: true
   ["encrypt", "decrypt"]
);

 

 

 

 const iv = window.crypto.getRandomValues(new Uint8Array(12));

 

 const privateKeyBytes = new TextEncoder().encode(JSON.stringify(privateKeyJwk));

 

 const encryptedPrivateKey = await window.crypto.subtle.encrypt(

 

     { name: "AES-GCM", iv: iv },

 

     encryptionKey,

 

     privateKeyBytes

 

 );

 

 

 

 const publicKeyBase64 = btoa(JSON.stringify(publicKeyJwk));

 

 const combinedEncryptedPrivate = new Uint8Array(iv.length + new Uint8Array(encryptedPrivateKey).length);

 

 combinedEncryptedPrivate.set(iv, 0);

 

 combinedEncryptedPrivate.set(new Uint8Array(encryptedPrivateKey), iv.length);

 

 

 

 const encryptedPrivateKeyBase64 = arrayBufferToBase64(combinedEncryptedPrivate.buffer);

 

 

 

 await db.collection('users').doc(user.uid).set({

 

     publicKey: publicKeyBase64,

 

     encryptedPrivateKey: encryptedPrivateKeyBase64,

 

 }, { merge: true });

 

 

 

 userDecryptionKey = keyPair.privateKey;

 

 console.log("E2EE keys generated and stored securely.");

 

}

 

 

 

// ********************************************************************************************

 

 

 

async function unlockPrivateKey(password, userData) {

 

 console.log("Attempting to unlock E2EE private key...");

 

 try {

 

     const encryptedPrivateKeyBase64 = userData.encryptedPrivateKey;

 

     if (!encryptedPrivateKeyBase64) return false;

 

   

 

     const combinedBuffer = base64ToArrayBuffer(encryptedPrivateKeyBase64);

 

     const combinedBytes = new Uint8Array(combinedBuffer);

 

     const IV_LENGTH = 12;

 

     const iv = combinedBytes.slice(0, IV_LENGTH);

 

     const ciphertextWithTag = combinedBytes.slice(IV_LENGTH);

 

 

 

     const passwordKey = await window.crypto.subtle.importKey(

 

         "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]

 

     );

 

     const decryptionKey = await window.crypto.subtle.deriveKey(

 

         { name: "PBKDF2", salt: KDF_SALT, iterations: 100000, hash: HASH_ALGO },

 

         passwordKey,

 

         { name: "AES-GCM", length: 256 },

 

         true, // *** FIX APPLIED: MUST BE TRUE ***

 

         ["decrypt"]

 

     );

 

 

 

     const decryptedPrivateJwkBytes = await window.crypto.subtle.decrypt(

 

         { name: "AES-GCM", iv: iv },

 

         decryptionKey,

 

         ciphertextWithTag

 

     );

 

   

 

     const privateKeyJwk = JSON.parse(new TextDecoder().decode(decryptedPrivateJwkBytes));

 

   

 

     userDecryptionKey = await window.crypto.subtle.importKey(

 

         "jwk", privateKeyJwk, { name: "RSA-OAEP", hash: HASH_ALGO }, false, ["decrypt", "unwrapKey"]

 

     );

 

   

 

     console.log("Private key unlocked successfully.");

 

     return true;

 

 } catch (error) {

 

     console.error("Private key decryption failed:", error.message);

 

     return false;

 

 }

 

}

 

 

 

// ********************************************************************************************

 

 

 

async function encryptText(text, recipientPublicKeyBase64) {

 

 if (!text || !recipientPublicKeyBase64) return "[Encryption Failed: Missing input]";

 

 

 

 let recipientPublicKey;

 

 try {

 

     const recipientPublicKeyJwk = JSON.parse(atob(recipientPublicKeyBase64));

 

     recipientPublicKey = await window.crypto.subtle.importKey(

 

         "jwk", recipientPublicKeyJwk, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt", "wrapKey"]

 

     );

 

 } catch (e) {

 

     return "[Encryption Error: Invalid recipient public key format.]";

 

 }

 

 

 

 try {

 

     const sessionKey = await window.crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

 

     const iv = window.crypto.getRandomValues(new Uint8Array(12));

 

     const plaintextBytes = new TextEncoder().encode(text);

 

     const encryptedMessage = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, sessionKey, plaintextBytes);

 

 

 

     const encryptedSessionKey = await window.crypto.subtle.wrapKey(

 

         "raw", sessionKey, recipientPublicKey, { name: "RSA-OAEP", hash: { name: "SHA-256" } }

 

     );

 

 

 

     const combinedData = JSON.stringify({

 

         esk: arrayBufferToBase64(encryptedSessionKey),

 

         iv: arrayBufferToBase64(iv.buffer),

 

         msg: arrayBufferToBase64(encryptedMessage),

 

     });

 

 

 

     return btoa(combinedData);

 

   

 

 } catch (error) {

 

     console.error("E2EE Encryption failed:", error);

 

     return `[Encryption Error: ${error.message}]`;

 

 }

 

}

 

 

 

// ********************************************************************************************

 

 

 

async function decryptText(base64Bundle) {

 

 if (!base64Bundle || !userDecryptionKey) return "[Decryption Failed: Key or data missing]";

 

 

 

 try {

 

     const jsonString = atob(base64Bundle);

 

     const combinedData = JSON.parse(jsonString);

 

   

 

     const encryptedSessionKeyBytes = base64ToArrayBuffer(combinedData.esk);

 

     const iv = new Uint8Array(base64ToArrayBuffer(combinedData.iv));

 

     const encryptedMessageBytes = base64ToArrayBuffer(combinedData.msg);

 

   

 

     const sessionKey = await window.crypto.subtle.unwrapKey(

 

         "raw", encryptedSessionKeyBytes, userDecryptionKey, { name: "RSA-OAEP", hash: "SHA-256" },

 

         { name: "AES-GCM", length: 256 }, false, ["decrypt"]

 

     );

 

   

 

     const decryptedMessageBytes = await window.crypto.subtle.decrypt(

 

         { name: "AES-GCM", iv: iv }, sessionKey, encryptedMessageBytes

 

     );

 

   

 

     return new TextDecoder().decode(decryptedMessageBytes);

 

 } catch (error) {

 

     console.error("E2EE Decryption failed:", error);

 

     return "[Decryption Error: Data corrupted or wrong key]";

 

 }

 

}

 

 

 

// ********************************************************************************************

 

 

 

async function checkAndUnlockKey(currentUser) {

 

 if (userDecryptionKey) {

 

     return true;

 

 }

 

 

 

 const userDoc = await db.collection('users').doc(currentUser.uid).get();

 

 const userData = userDoc.data() || {};

 

 

 

 // --- Scenario 1: Social User (Key must be present, attempt unlock with UID) ---

 

 if (userData.kdfKey) {

 

     console.log("Detected social user. Attempting automatic unlock with KDF key.");

 

     // The password for social users appears to be stored in userData.kdfKey

 

     const unlocked = await unlockPrivateKey(userData.kdfKey, userData);

 

   

 

     if (unlocked) {

 

         console.log("Social user key unlocked automatically.");

 

         return true;

 

     } else {

 

         // If unlock fails, it means the key is corrupted or password changed.

 

         // We force signout to trigger the regeneration logic in signInWithGoogle.

 

         console.error("Social key unlock failed. Forcing signout to trigger key reset.");

 

         auth.signOut();

 

         return false;

 

     }

 

 }

 

 

 

 // --- Scenario 2: Standard/New User (Check for key existence) ---

 

 if (userData.encryptedPrivateKey) {

 

     // Key exists, but hasn't been unlocked. Show the modal.

 

     document.getElementById('unlock-key-modal')?.classList.remove('hidden');

 

     return false;

 

 } else {

 

     // Key does NOT exist. This user is either brand new (and needs to be

 

     // processed by signIn/signUp), or signed out with a failed key gen.

 

     // DO NOT FORCE SIGNOUT HERE. Let the main app flow handle it.

 

     console.log("User profile loaded but E2EE key is missing. Allowing sign-in flow to proceed and check/generate the key.");

 

     // We still return false because the key isn't unlocked yet,

 

     // preventing the main chat app from loading until the key is generated/unlocked.

 

     return false;

 

 }

 

}

 

// ====================================================================

 

// AUTHENTICATION & PROFILE FUNCTIONS 👤

 

// ====================================================================

 

 

 

document.addEventListener('DOMContentLoaded', () => {

 

 // Attach event listeners safely after DOM is loaded

 

 document.getElementById('auth-form')?.addEventListener('submit', (e) => {

 

     e.preventDefault();

 

     if (isLoginMode) signInWithEmailPassword(); else signUpWithEmailPassword();

 

 });

 

 

 

 document.getElementById('auth-toggle-link')?.addEventListener('click', toggleAuthMode);

 

 document.getElementById('navbar-signin-btn')?.addEventListener('click', showSigninForm);

 

 document.getElementById('navbar-signup-btn')?.addEventListener('click', showSignupForm);

 

 document.getElementById('forgot-password-link')?.addEventListener('click', sendPasswordReset);

 

 document.getElementById('google-login-button')?.addEventListener('click', signInWithGoogle);

 

 document.getElementById('unlock-key-button')?.addEventListener('click', attemptKeyUnlockFromModal);

 

});

 

 

 

 

 

function toggleAuthMode() {

 

 const authTitle = document.getElementById('auth-title');

 

 const authSubmitBtn = document.getElementById('auth-submit-btn');

 

 const authToggleText = document.getElementById('auth-toggle-text');

 

 const authToggleLink = document.getElementById('auth-toggle-link');

 

 const forgotPasswordLink = document.getElementById('forgot-password-link');

 

 const confirmPasswordInput = document.getElementById('confirm-password-input');

 

 const usernameInput = document.getElementById('username-input');

 

 const emailVerificationMessage = document.getElementById('email-verification-message');

 

 

 

 isLoginMode = !isLoginMode;

 


 if (isLoginMode) {

 

     authTitle.textContent = 'Welcome back';

 

     authSubmitBtn.textContent = 'Log in';

 

     authToggleText.textContent = "Don't have an account?";

 

     authToggleLink.textContent = 'Sign up';

 

     forgotPasswordLink?.classList.remove('hidden');

 

     confirmPasswordInput?.classList.add('hidden');

 

     usernameInput?.classList.add('hidden');

 

     emailVerificationMessage?.classList.add('hidden');

 

 } else {

 

     authTitle.textContent = 'Create Account';

 

     authSubmitBtn.textContent = 'Sign up';

 

     authToggleText.textContent = "Already have an account?";

 

     authToggleLink.textContent = 'Log in';

 

     forgotPasswordLink?.classList.add('hidden');

 

     confirmPasswordInput?.classList.remove('hidden');

 

     usernameInput?.classList.remove('hidden');

 

     emailVerificationMessage?.classList.add('hidden');

 

 }

 

}

 

function showSigninForm() {
 const authTitle = document.getElementById('auth-title');
 const authSubmitBtn = document.getElementById('auth-submit-btn');
 const authToggleText = document.getElementById('auth-toggle-text');
 const authToggleLink = document.getElementById('auth-toggle-link');
 const forgotPasswordLink = document.getElementById('forgot-password-link');
 const confirmPasswordInput = document.getElementById('confirm-password-input');
 const usernameInput = document.getElementById('username-input');
 const emailVerificationMessage = document.getElementById('email-verification-message');
 const emailInput = document.getElementById('email-input');
 const passwordInput = document.getElementById('password-input');
 const formContainer = document.querySelector('.form-container');
 isLoginMode = true;
 authTitle.textContent = 'Welcome back';
 authSubmitBtn.textContent = 'Log in';
 authToggleText.textContent = "Don't have an account?";
 authToggleLink.textContent = 'Sign up';
 forgotPasswordLink?.classList.remove('hidden');
 confirmPasswordInput?.classList.add('hidden');
 usernameInput?.classList.add('hidden');
 emailVerificationMessage?.classList.add('hidden');
 emailInput.value = '';
 passwordInput.value = '';
 formContainer?.classList.remove('hidden');
}

 

function showSignupForm() {
const authTitle = document.getElementById('auth-title');
 const authSubmitBtn = document.getElementById('auth-submit-btn');
 const authToggleText = document.getElementById('auth-toggle-text');
 const authToggleLink = document.getElementById('auth-toggle-link');
 const forgotPasswordLink = document.getElementById('forgot-password-link');
 const confirmPasswordInput = document.getElementById('confirm-password-input');
 const usernameInput = document.getElementById('username-input');
 const emailVerificationMessage = document.getElementById('email-verification-message');
 const emailInput = document.getElementById('email-input');
 const passwordInput = document.getElementById('password-input');
 const formContainer = document.querySelector('.form-container');
 isLoginMode = false;
 authTitle.textContent = 'Create Account';
 authSubmitBtn.textContent = 'Sign up';
 authToggleText.textContent = "Already have an account?";
  authToggleLink.textContent = 'Log in';
forgotPasswordLink?.classList.add('hidden');
 confirmPasswordInput?.classList.remove('hidden');
 usernameInput?.classList.remove('hidden');
 emailVerificationMessage?.classList.add('hidden');
 emailInput.value = '';
 passwordInput.value = '';
 confirmPasswordInput.value = '';
 usernameInput.value = '';
 formContainer?.classList.remove('hidden');
}

 

 

 

// Add this check at the very start of the process that depends on 'user.uid'

 

async function signInWithGoogle() {

 

 const provider = new firebase.auth.GoogleAuthProvider();

 

 try {

 

     const result = await auth.signInWithPopup(provider);

 

   

 

     // --- CRITICAL FIX: Robust check, relying only on 'return' for safety ---

 

     if (!result || !result.user || !result.user.uid) {

 

         console.error("Google Sign-in failed or was canceled. User object is null.");

 

         // Removed redundant alert() call to prevent possible race condition/crash

 

         return;

 

     }

 

   

 

     // Only set the global user variable AFTER confirming success

 

     user = result.user;

 

   

 

     const userDocRef = db.collection('users').doc(user.uid);

 

     const userDoc = await userDocRef.get();

 

     let userData = userDoc.data() || {};

 

   

 

     let passwordForE2EE = null;

 

     let shouldGenerateKeys = false;

 

   

 

     // Determine if this is a new user setup (no username OR no E2EE key)

 

     let isNewUser = !userData.username || !userData.kdfKey;

 

 

 

     // --- NEW USER / SETUP PHASE ---

 

     if (isNewUser) {

 

       

 

         const setupResult = await promptForUsernameAndPassword();

 

 

 

         if (!setupResult || !setupResult.username || !setupResult.password) {

 

             alert("Username and password are required for initial setup. Sign-in aborted.");

 

             await auth.signOut();

 

             return;

 

         }

 

       

 

         passwordForE2EE = setupResult.password;

 

         const chosenUsername = setupResult.username;

 

 

 

         // Check and validate username

 

         if (!isValidUsername(chosenUsername) || !(await checkUsernameAvailability(chosenUsername))) {

 

             alert("Username already taken or invalid. Please sign in again.");

 

             await auth.signOut();

 

             return;

 

         }

 

       

 

         // FIX: Isolate profile creation to catch specific setup errors

 

         try {

 

             // Create user profile

 

             const nameToUse = user.displayName || user.email.split('@')[0];

 

             await createUserProfile(user, chosenUsername, user.photoURL || DEFAULT_PHOTO_URL, nameToUse);

 

       

 

             shouldGenerateKeys = true;

 

         } catch (setupError) {

 

             // If profile creation fails, sign out and report the specific error

 

             console.error("User profile setup failed:", setupError);

 

             alert("Setup failed: " + setupError.message + ". Please try again.");

 

             await auth.signOut();

 

             return;

 

         }

 

       

 

     } else {

 

         // --- EXISTING USER PHASE (Logic remains the same) ---

 

       

 

         passwordForE2EE = userData.kdfKey;

 

       

 

         const unlocked = await unlockPrivateKey(passwordForE2EE, userData);

 

       

 

         if (!unlocked) {

 

             console.warn("Key decryption failed with stored password. Asking user for recovery password.");

 

           

 

             const recoveryPassword = prompt("We couldn't decrypt your keys. Please re-enter your Chatify E2EE password:");

 

           

 

             if (!recoveryPassword) {

 

                 alert("E2EE password is required. Sign-in failed.");

 

                 await auth.signOut();

 

                 return;

 

             }

 

           

 

             passwordForE2EE = recoveryPassword;

 

             shouldGenerateKeys = true;

 

           

 

             await userDocRef.update({

 

                 encryptedPrivateKey: firebase.firestore.FieldValue.delete(),

 

                 publicKey: firebase.firestore.FieldValue.delete(),

 

             });

 

         }

 

     }

 

   

 

     // --- KEY GENERATION AND STORAGE ---

 

     if (shouldGenerateKeys) {

 

         // FIX: Isolate key generation to catch Web Crypto API errors

 

         try {

 

             await generateAndStoreKeys(passwordForE2EE);

 

             await userDocRef.set({ kdfKey: passwordForE2EE }, { merge: true });

 

         } catch (keyGenError) {

 

             console.error("E2EE Key Generation failed:", keyGenError);

 

             alert("E2EE key generation failed: " + keyGenError.message + ". Your login is incomplete. You will be signed out.");

 

             await auth.signOut();

 

             return;

 

         }

 

     }

 

 

 

     // --- FINAL SETUP AND APP LOAD ---

 

     await userDocRef.set({ isOnline: true }, { merge: true });

 

 

 

     document.getElementById('login-page')?.classList.add('hidden');

 

     document.getElementById('chat-app')?.classList.add('show');

 

     // Pause video when switching to chat-app

     const video = document.querySelector('.video-section video');

     if (video) {

       video.pause();

     }

 

     initializeChatListeners(user);

 

 

 

 } catch(error) {

 

     // FIX: Made the catch block robust to prevent crashing when reporting an error

 

     const errorMessage = error && error.message ? error.message : "An unknown error occurred during sign-in. Check console for details.";

 

     console.error("Google Sign-in failed (Outer Catch):", error);

 

     alert("Google Sign-in failed: " + errorMessage);

 

 }

 

}

 

/**

 

* YOU MUST IMPLEMENT THIS AS AN HTML MODAL/DIALOG.

 

* This is a mockup to show what it must return.

 

*/

 

async function promptForUsernameAndPassword() {

 

 // 1. Show your HTML modal with two input fields: username and password

 

 // 2. Wait for the user to submit the form

 

 

 

 // Example using prompt (not recommended for production):

 

 const username = prompt("Welcome! Please choose a unique username:");

 

 if (!username) return null;

 

 

 

 // IMPORTANT: Use a password input field in your actual UI

 

 const password = prompt("Please set a strong E2EE password (min 8 chars):");

 

 

 

 if (!password || password.length < 8) {

 

     // You would typically handle this inside your modal UI

 

     alert("Password too weak or missing.");

 

     return null;

 

 }

 

 

 

 return { username: username.trim(), password: password };

 

}

 

 

 

 

 

async function signInWithEmailPassword() {

 

 // 1. Retrieve and clean inputs

 

 const emailInput = document.getElementById('email-input');

 

 const email = emailInput ? emailInput.value.trim() : "";

 

 const password = document.getElementById('password-input')?.value;

 

 const emailVerificationMessage = document.getElementById('email-verification-message');

 

 const emailVerificationMessageText = document.getElementById('email-verification-message-text');

 

 

 

 if (!email || !password) return alert("Please enter both email and password.");

 

 

 

 if (!email.includes('@')) return alert("Please enter a valid email address.");

 

 

 

 try {

 

     // --- ATTEMPT 1: Standard Email/Password Sign-in ---

 

     const userCredential = await auth.signInWithEmailAndPassword(email, password);

 

     user = userCredential.user;

 

     await user.reload();

 

   

 

     // --- SUCCESS PATH ---

 

     if (!user.emailVerified) {

 

         emailVerificationMessageText.textContent = `Please verify your email: ${user.email}. Check your inbox for a verification link.`;

 

         emailVerificationMessage?.classList.remove('hidden');

 

         document.getElementById('chat-app')?.classList.remove('show');

         // Resume video when back on login-page

         const video = document.querySelector('.video-section video');

         if (video) {

           video.play();

         }

 

         return;

 

     }

 

 

 

     const userDoc = await db.collection('users').doc(user.uid).get();

 

     let userData = userDoc.data() || {};

 

   

 

     if (userData.encryptedPrivateKey) {

 

         const unlocked = await unlockPrivateKey(password, userData);

 

         if (!unlocked) {

 

             await auth.signOut();

 

             return alert("Login failed: Error unlocking private key. Check your password.");

 

         }

 

     } else {

 

         console.warn("User profile not found or missing E2EE key. Generating new key pair.");

 

         await generateAndStoreKeys(password);

 

         const newUserDoc = await db.collection('users').doc(user.uid).get();

 

         userData = newUserDoc.data() || {};

 

     }

 

   

 

     if (!userData.username) {

 

         await auth.signOut();

 

         return alert("Your account is missing a unique username. Please contact support.");

 

     }

 

   

 

     await db.collection('users').doc(user.uid).set({ isOnline: true }, { merge: true });

 

   

 

     document.getElementById('login-page')?.classList.add('hidden');

 

     document.getElementById('chat-app')?.classList.add('show');

 

     initializeChatListeners(user);

 

 

 

 } catch(error) {

 

     // --- CATCH BLOCK: HANDLING CREDENTIAL AND PROVIDER ERRORS ---

 

     console.error("Sign-in attempt failed:", error);

 

 

 

     let errorMessage = error.message || "";

 

     const isRawJsonError = errorMessage.includes("INVALID_LOGIN_CREDENTIALS");

 

   

 

     const isCredentialError = isRawJsonError || error.code === 'auth/internal-error' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential';

 

 

 

     if (isCredentialError) {

 

       

 

         try {

 

             const methods = await auth.fetchSignInMethodsForEmail(email);

 

 

 

             // Scenario A: Confirmed Google Account

 

             if (methods && methods.includes('google.com')) {

 

                 const useGoogle = confirm("This email is associated with a Google account.\n\nClick OK to sign in with Google now.");

 

                 if (useGoogle) {

 

                     try {

 

                         await signInWithGoogle();

 

                         return;

 

                     } catch (googleError) {

 

                         console.error("Google Sign-in initiated from email flow failed:", googleError);

 

                       

 

                         // 🌟 FIX APPLIED HERE: Defensive error reading

 

                         const friendlyError = googleError && googleError.message

 

                             ? googleError.message

 

                             : "The Google sign-in process failed or was canceled.";

 

                       

 

                         return alert("Google Sign-in failed: " + friendlyError);

 

                     }

 

                 }

 

             }

 

             // Scenario B: Fallback guess if we got the specific JSON error

 

             else if (isRawJsonError) {

 

                 const useGoogleFallback = confirm("Login failed. If you usually log in with Google, click OK to switch to Google Login.\n\nOtherwise, check your password.");

 

                 if (useGoogleFallback) {

 

                     try {

 

                         await signInWithGoogle();

 

                         return;

 

                     } catch (googleError) {

 

                          const friendlyError = googleError && googleError.message

 

                             ? googleError.message

 

                             : "The Google sign-in process failed or was canceled.";

 

                         return alert("Google Sign-in failed: " + friendlyError);

 

                     }

 

                 }

 

             }

 

         } catch (checkError) {

 

             console.warn("Could not verify sign-in methods:", checkError);

 

         }

 

     }

 

 

 

     // 4. Final Fallback Alert (Clean up the JSON error)

 

     if (errorMessage.includes("INVALID_LOGIN_CREDENTIALS") || errorMessage.includes("INVALID_PASSWORD")) {

 

         errorMessage = "Invalid email or password.";

 

     }

 

 

 

     alert("Login failed: " + errorMessage);

 

 }

 

}

 

 

 

 

 

async function signUpWithEmailPassword() {

 

 // NOTE: Ensure your HTML IDs match these selectors: 'email-input', 'password-input', etc.

 

 const email = document.getElementById('email-input')?.value;

 

 const password = document.getElementById('password-input')?.value;

 

 const confirmPassword = document.getElementById('confirm-password-input')?.value;

 

 const username = document.getElementById('username-input')?.value.trim();

 

 

 

 // --- Input Validation ---

 

 if (!email || !password || !confirmPassword || !username) {

 

     return alert("Please fill in all required fields.");

 

 }

 

 if (password !== confirmPassword) {

 

     return alert("Passwords do not match.");

 

 }

 

 if (!isValidUsername(username)) {

 

     return alert("Invalid username. Must be 3-15 characters, using letters, numbers, '.', or '_'.");

 

 }

 

 

 

 // --- Username Availability Check (Correct Logic) ---

 

 // The alert triggers IF the username is NOT available (i.e., taken or invalid format).

 

 if (!(await checkUsernameAvailability(username))) {

 

     return alert(`Username @${username} is already taken or invalid. Please choose another.`);

 

 }

 

 

 

 try {
     // 1. Create Firebase User
     const userCredential = await auth.createUserWithEmailAndPassword(email, password);
     user = userCredential.user;
// 2. Generate E2EE Keys using the user's password

     await generateAndStoreKeys(password);

  // 3. Create Profile and Username Entry
      const defaultName = email.split('@')[0];
 // NOTE: createUserProfile should also create a document in your 'usernames' collection

 // to reserve the name.
     await createUserProfile(user, username, DEFAULT_PHOTO_URL, defaultName);

  // 4. Update Auth Profile

     await user.updateProfile({ displayName: defaultName, photoURL: DEFAULT_PHOTO_URL });

     // 5. Store KDF Key (Password/Secret) for future E2EE decryption

     await db.collection('users').doc(user.uid).set({ kdfKey: password }, { merge: true });

 // 6. Send Verification

       await user.sendEmailVerification();

      alert("Account created! Please verify your email before logging in. Your username is @" + username);

       toggleAuthMode();

 

   

 

 } catch(error) {

 

     console.error("Sign-up failed:", error);

 

     // Display specific Firebase errors like 'auth/email-already-in-use'

 

     alert("Sign-up failed: " + error.message);

 

 }

 

}

 

async function attemptKeyUnlockFromModal() {

 

 const passwordInput = document.getElementById('key-password-input');

 

 const errorEl = document.getElementById('key-unlock-error');

 

 

 

 const password = passwordInput?.value;

 

 if(errorEl) errorEl.textContent = '';

 

 

 

 if (!password) {

 

     if(errorEl) errorEl.textContent = "Password cannot be empty.";

 

     return;

 

 }

 

 

 

 const userDoc = await db.collection('users').doc(user.uid).get();

 

 const userData = userDoc.data() || {};

 

 let unlocked = await unlockPrivateKey(password, userData);

 

 

 

 if (!unlocked && userData.kdfKey) {

 

     unlocked = await unlockPrivateKey(userData.kdfKey, userData);

 

 }

 

 

 

 if (unlocked) {

 

     if(passwordInput) passwordInput.value = '';

 

     document.getElementById('unlock-key-modal')?.classList.add('hidden');

 

     initializeChatListeners(user);

 

 } else {

 

     if(errorEl) errorEl.textContent = "Incorrect password or corrupted key. Try again or logout.";

 

 }

 

}

 

 

 

function signOut() {

 

 db.collection('users').doc(user.uid).update({ isOnline: false, lastSeen: firebase.firestore.FieldValue.serverTimestamp() })

 

     .then(() => {

 

         userDecryptionKey = null;

 

         // Resume video when signing out

         const video = document.querySelector('.video-section video');

         if (video) {

           video.play();

         }

 

         auth.signOut();

 

         closeSettingsModal();

 

     })

 

     .catch(error => {

 

         console.error("Sign out error:", error);

 

         auth.signOut();

 

     });

 

}

 

 

 

// ====================================================================

 

// CHAT APP LISTENERS & UI 💬

 

// ====================================================================

 

 

 

auth.onAuthStateChanged(async (currentUser) => {

 

 if (currentUser) {

 

     user = currentUser;

 

 

 

     if (user.emailVerified) {

 

         document.getElementById('login-page')?.classList.add('hidden');

 

         document.getElementById('chat-app')?.classList.add('show');

 

         // Pause video when switching to chat-app

         const video = document.querySelector('.video-section video');

         if (video) {

           video.pause();

         }

       

         const isKeyUnlocked = await checkAndUnlockKey(user);

 

 

 

         if (isKeyUnlocked) {

 

             initializeChatListeners(user);

 

             document.getElementById('unlock-key-modal')?.classList.add('hidden');

 

         } else {

 

             if (messageListenerUnsubscribe) messageListenerUnsubscribe();

 

             if (recentChatListenerUnsubscribe) recentChatListenerUnsubscribe();

 

         }

 

 

 

     } else {

 

         document.getElementById('login-page')?.classList.remove('hidden');

 

         document.getElementById('chat-app')?.classList.remove('show');

 

         const messageText = document.getElementById('email-verification-message-text');

 

         if(messageText) messageText.textContent = `Please verify your email: ${user.email}. Check your inbox for a verification link.`;

 

         document.getElementById('email-verification-message')?.classList.remove('hidden');

 

     }

 

 

 

 } else {

 

     user = null;

 

     document.getElementById('login-page')?.classList.remove('hidden');

 

     document.getElementById('chat-app')?.classList.remove('show');

 

     // Resume video when back on login-page

     const video = document.querySelector('.video-section video');

     if (video) {

       video.play();

     }

 

     if (messageListenerUnsubscribe) messageListenerUnsubscribe();

 

     if (recentChatListenerUnsubscribe) recentChatListenerUnsubscribe();

 

     if (userStatusListenerUnsubscribe) userStatusListenerUnsubscribe();

 

     document.getElementById('unlock-key-modal')?.classList.add('hidden');

 

     userDecryptionKey = null;

 

 }

 

});

 

 

 

 

 

async function initializeChatListeners(currentUser) {

 

 if (!currentUser || !db) return; // Safety check

 

 

 

 // --------------------------------------------------------------------------------

 

 // 0. FIX 1: IMMEDIATELY FETCH PROFILE DATA (Async Read)

 

 // This prevents the 'Loading...' state by updating the UI with static data ASAP.

 

 // --------------------------------------------------------------------------------

 

 try {

 

     const doc = await db.collection('users').doc(currentUser.uid).get();

 

     if (doc.exists) {

 

         const profile = doc.data();

 

         const myUsernameEl = document.getElementById('my-username');

 

         // Use the fetched username immediately. Fallback to a better message.

 

         const usernameText = profile.username ? `@${profile.username}` : '@Setup Required';

 

         if (myUsernameEl) myUsernameEl.textContent = usernameText;

 

       

 

         // NOTE: If you have a global 'user' object holding state, update it here.

 

         // user = { ...user, ...profile };

 

     }

 

 } catch (e) {

 

     console.error("Failed to fetch initial profile data:", e);

 

 }

 

 

 

 // --------------------------------------------------------------------------------

 

 // 1. Listener for Recent Chats (Active Chats Only)

 

 // --------------------------------------------------------------------------------

 

 if (recentChatListenerUnsubscribe) recentChatListenerUnsubscribe();

 

 

 

 // Query the 'userChats' list for the current user, ordered by last message time.

 

 recentChatListenerUnsubscribe = db.collection('userChats').doc(currentUser.uid).collection('list')

 

   .orderBy('lastMessageAt', 'desc')

 

   .limit(10)

 

   .onSnapshot(async (snapshot) => {

 

     

 

       // --- FIX: 1. CLEAR THE LIST ---

 

       const chatListEl = document.getElementById('chat-list');

 

       if (chatListEl) chatListEl.innerHTML = '';

 

     

 

       const userPromises = [];

 

       snapshot.forEach(doc => {

 

           const chatPartnerId = doc.id;

 

           // Fetch the full user document for the chat partner

 

           const userPromise = db.collection('users').doc(chatPartnerId).get();

 

           userPromises.push(userPromise);

 

       });

 

 

 

       // Wait for all user profile fetches to complete

 

       const userDocs = await Promise.all(userPromises);

 

     

 

       // --- FIX: 2. RENDER THE FETCHED USERS ---

 

       userDocs.forEach(userDoc => {

 

           if (userDoc.exists) {

 

               const userData = { id: userDoc.id, ...userDoc.data() };

 

             

 

               // This relies on the renderChatListItem function provided in previous steps

 

               renderChatListItem(userData);

 

           }

 

       });

 

     

 

   }, error => console.error("Error fetching recent chats:", error));

 

 

 

 // --------------------------------------------------------------------------------

 

 // 2. Listener for User Status (Original Logic Retained, but fixed)

 

 // --------------------------------------------------------------------------------

 

 if (userStatusListenerUnsubscribe) userStatusListenerUnsubscribe();

 

 userStatusListenerUnsubscribe = db.collection('users').doc(currentUser.uid)

 

   // FIX 2: Explicitly re-add the username update logic here for real-time changes

 

   .onSnapshot(doc => {

 

       if (doc.exists) {

 

           const profile = doc.data();

 

           const myUsernameEl = document.getElementById('my-username');

 

           // Update for real-time changes (e.g., if user changes username in settings)

 

           if(myUsernameEl) myUsernameEl.textContent = `@${profile.username || 'Loading...'}`;

 

 

 

           // This logic is likely for updating the chat header if the user is chatting with themselves

 

           if (selectedUser && selectedUser.id === currentUser.uid) {

 

               selectedUser = { ...selectedUser, ...profile };

 

               const chatHeaderId = selectedUser.name || selectedUser.username ? `@${selectedUser.username}` : selectedUser.id.substring(0, 8);

 

               document.getElementById('chat-with').textContent = chatHeaderId;

 

               document.getElementById('chat-photo').src = selectedUser.photoURL || DEFAULT_PHOTO_URL;

 

           }

 

       }

 

   }, error => console.error("Error fetching user profile:", error));

 

}

 

/**

 

* Creates and appends a single chat list item to the sidebar.

 

* @param {Object} userData - The user's profile data (id, username, photoURL, isOnline, etc.).

 

*/

 

// Function: renderChatListItem (Creates and appends a single chat list item)

 

function renderChatListItem(userData) {

 

 const chatList = document.getElementById('chat-list');

 

 if (!chatList) return;

 

 

 

 // Remove any existing item for this user to prevent duplicates on update

 

 const existingItem = document.getElementById(`chat-item-${userData.id}`);

 

 if (existingItem) existingItem.remove();

 

 

 

 const item = document.createElement('div');

 

 item.id = `chat-item-${userData.id}`;

 

 item.classList.add('chat-list-item');

 

 item.setAttribute('data-uid', userData.id);

 

 

 

 // Add click handler to switch to this chat

 

 item.onclick = () => selectUserToChat(userData);

 

 

 

 const statusClass = userData.isOnline ? 'online' : 'offline';

 

 // Assumes userData.lastSeen is a Firebase Timestamp object

 

 const lastSeenText = userData.isOnline

 

     ? 'Online'

 

     : (userData.lastSeen ? `Last seen: ${new Date(userData.lastSeen.toDate()).toLocaleTimeString()}` : 'Offline');

 

 

 

 // Build the inner HTML structure

 

 item.innerHTML = `

 

     <div class="chat-photo-container">

 

         <img class="chat-photo" src="${userData.photoURL || DEFAULT_PHOTO_URL}" alt="${userData.username}">

 

         <span class="status-dot ${statusClass}"></span>

 

     </div>

 

     <div class="chat-details">

 

         <div class="chat-name">${userData.name || userData.username}</div>

 

         <div class="chat-last-message">${lastSeenText}</div>

 

     </div>

 

 `;

 

 

 

 // Add the new item to the list

 

 chatList.appendChild(item);

 

}

 

/**

 

* Handles the logic when a user is clicked in the Recent Chats list or Search results.

 

* It sets the selected user, updates the chat header, and starts listening for messages.

 

* @param {Object} userData - The user profile data of the person to chat with.

 

*/

 

function selectUserToChat(userData) {

 

 // NOTE: Assumes 'user' is the global current authenticated user object

 

 if (!user) {

 

     console.error("Current user not defined.");

 

     return;

 

 }

 

 if (selectedUser && selectedUser.id === userData.id) return;

 

 

 

 // Fetch fresh user data from database to get updated lastSeen

 

 db.collection('users').doc(userData.id).get().then(doc => {

     if (doc.exists) {

         const freshUserData = { id: doc.id, ...doc.data() };

         

         // 1. Update the selected user state

         

         selectedUser = freshUserData;

 

 

 

 // 2. Update the chat header UI

 

 const chatHeaderId = selectedUser.name || selectedUser.username ? `@${selectedUser.username}` : selectedUser.id.substring(0, 8);

 

 document.getElementById('chat-with').textContent = chatHeaderId;

 

 // NOTE: Assumes DEFAULT_PHOTO_URL is defined globally

 

 document.getElementById('chat-photo').src = selectedUser.photoURL || DEFAULT_PHOTO_URL;

   // Update header presence dot

   (function(){ const el = document.getElementById('chat-header-status'); if (el) { if (selectedUser && selectedUser.isOnline) { el.classList.add('online'); el.classList.remove('offline'); } else { el.classList.remove('online'); el.classList.add('offline'); } } })();

 

 

 

 // Show the main chat area

 

 document.getElementById('chat-app').classList.add('show-main');

 

 

 

 // 3. Stop the old message listener and start a new one

 

 if (chatMessageListenerUnsubscribe) chatMessageListenerUnsubscribe();

 

 

 

 // Clear old messages from the UI

 

 const messagesDiv = document.getElementById('messages');

 

 if(messagesDiv) messagesDiv.innerHTML = '';

 

 

 

 // Start listening for messages in the new chat

 

 chatMessageListenerUnsubscribe = listenForMessages(user, selectedUser);

 

 

 

 // Add visual feedback to the list item

 

 document.querySelectorAll('.chat-list-item').forEach(el => el.classList.remove('active'));

 

 document.getElementById(`chat-item-${selectedUser.id}`)?.classList.add('active');

 

 // Update block button / send UI based on block status
         try { updateBlockUI(); } catch (e) { console.warn('updateBlockUI error', e); }
     }
 }).catch(error => {
     console.error('Error fetching user data:', error);
     alert('Failed to load user data');
 });

}

 

// This is the function that initializes the message listener in the main window

 

function listenForMessages(currentUser, chatPartner) {

 

 const chatId = [currentUser.uid, chatPartner.id].sort().join('_');

 

 const messagesRef = db.collection('chats').doc(chatId).collection('messages')

 

     .orderBy('timestamp', 'asc');

 

 

 

 // Return the unsubscribe function so we can stop listening later

 

 return messagesRef.onSnapshot(snapshot => {

 

     snapshot.docChanges().forEach(async (change) => {

 

         if (change.type === 'added') {

 

             const message = change.doc.data();

 

           

 

             // Determine which encrypted field to decrypt (senderText for self, text for receiver)

 

             const encryptedText = message.senderId === currentUser.uid

 

                 ? message.senderText

 

                 : message.text;

 

 

 

             try {

 

                 // Decrypt the message using your provided decryptText function

 

                 const decryptedText = await decryptText(encryptedText);

 

               

 

                 const renderedMessage = {

 

                     ...message,

 

                     text: decryptedText // Replace encrypted text with decrypted text

 

                 };

 

               

 

                 renderMessage(renderedMessage);

 

               

 

             } catch (e) {

 

                 console.error("Decryption failed:", e);

 

                 // Render an error message if decryption fails

 

                 renderMessage({

 

                     ...message,

 

                     text: "[Decryption Failed]",

 

                     timestamp: message.timestamp

 

                 });

 

             }

 

         }

 

     });

 

   // We rely on renderMessage to call scrollToBottom, but a final immediate jump is safer here.

   scrollToBottom(true);

 

 });

 

}

 

 

 

function selectUser(userId, userData) {

 

 if (messageListenerUnsubscribe) messageListenerUnsubscribe();

 

 if (typingListenerUnsubscribe) typingListenerUnsubscribe();

 

 

 

 if (!userDecryptionKey) {

 

     alert("Cannot open chat: Please unlock your private key first.");

 

     checkAndUnlockKey(user);

 

     return;

 

 }

 

 

 

 selectedUser = { id: userId, ...userData };

 

 

 

 const chatHeaderId = userData.name || userData.username ? `@${userData.username}` : userId.substring(0, 8);

 

 document.getElementById('chat-with').textContent = chatHeaderId;

 

 document.getElementById('chat-photo').src = userData.photoURL || DEFAULT_PHOTO_URL;

 

 document.getElementById('messages').innerHTML = 'Loading messages...';

 

   // Update block button / send UI based on block status

   try { updateBlockUI(); } catch (e) { console.warn('updateBlockUI error', e); }

 

 

 

 if (window.innerWidth <= 768) {

 

     document.getElementById('sidebar')?.classList.remove('open');

 

 }

 

 

 

 const chatId = [user.uid, userId].sort().join('_');

 

 

 // Start listening for typing status

 

 listenToTypingStatus();

 

 

 

 messageListenerUnsubscribe = db.collection('chats').doc(chatId).collection('messages')

 

     .orderBy('timestamp', 'asc')

 

     .onSnapshot(async (snapshot) => {

 

         const messagesDiv = document.getElementById('messages');

 

         if(!messagesDiv) return;

 

 

 

         if (snapshot.docChanges().length === snapshot.docs.length) {

 

             messagesDiv.innerHTML = '';

 

 

 

             for (const doc of snapshot.docs) {

 

                 const data = doc.data();

 

                 const encryptedText = data.senderId === user.uid ? data.senderText : data.text;

 

                 let decryptedText = await decryptText(encryptedText || data.text);

 

               

 

                 if (decryptedText.startsWith('[Decryption Error')) {

 

                     decryptedText = data.senderId === user.uid

 

                         ? "❌ Error: Message failed to decrypt (Key failure)."

 

                         : "🔒 Encrypted Message (Decryption failed)";

 

                 }

 

 

 

                 renderMessage({ senderId: data.senderId, text: decryptedText, timestamp: data.timestamp, read: data.read || false });

 

                 

 

                 // Mark received messages as read

 

                 if (data.senderId !== user.uid && !data.read) {

 

                     await db.collection('chats').doc(chatId).collection('messages').doc(doc.id).update({ read: true });

 

                 }

 

             }

 

 

 

             // After rendering full history, jump to bottom immediately

             scrollToBottom(true);

 

         } else {

 

             for (const change of snapshot.docChanges()) {

 

                 if (change.type === 'added') {

 

                     const data = change.doc.data();

 

                     const encryptedText = data.senderId === user.uid ? data.senderText : data.text;

 

                     let decryptedText = await decryptText(encryptedText || data.text);

 

                   

 

                     if (decryptedText.startsWith('[Decryption Error')) {

 

                         decryptedText = data.senderId === user.uid

 

                             ? "❌ Error: Message failed to decrypt (Key failure)."

 

                             : "🔒 Encrypted Message (Decryption failed)";

 

                     }

 

 

 

                     renderMessage({ senderId: data.senderId, text: decryptedText, timestamp: data.timestamp, read: data.read || false });

                     

                     

                     // Mark received messages as read

 

                     if (data.senderId !== user.uid && !data.read) {

 

                         await db.collection('chats').doc(chatId).collection('messages').doc(change.doc.id).update({ read: true });

 

                     }

 

                     scrollToBottom();

 

                 } else if (change.type === 'modified') {

 

                     // Handle when a message's read status changes

 

                     const data = change.doc.data();

 

                     const messagesDiv = document.getElementById('messages');

 

                     

 

                     // Remove all messages and re-render them to update read status

 

                     if (messagesDiv && data.senderId === user.uid) {

 

                         messagesDiv.innerHTML = '';

 

                         

 

                         for (const doc of snapshot.docs) {

 

                             const msgData = doc.data();

 

                             const encryptedText = msgData.senderId === user.uid ? msgData.senderText : msgData.text;

 

                             let decryptedText = await decryptText(encryptedText || msgData.text);

 

                           

 

                             if (decryptedText.startsWith('[Decryption Error')) {

 

                                 decryptedText = msgData.senderId === user.uid

 

                                     ? "❌ Error: Message failed to decrypt (Key failure)."

 

                                     : "🔒 Encrypted Message (Decryption failed)";

 

                             }

 

 

 

                             renderMessage({ senderId: msgData.senderId, text: decryptedText, timestamp: msgData.timestamp, read: msgData.read || false });

 

                         }

 

                     }

 

                 }

 

             }

 

         }

 

     }, (error) => console.error("Error fetching messages:", error));

 

}

 

 

 

 

 

async function sendMessage() {

 

 const input = document.getElementById('message-input');

 

 const text = input?.value.trim();

 

 

 

 // NOTE: 'user' is assumed to be the globally available authenticated user object (e.g., firebase.auth().currentUser)

 

   if (!text || !selectedUser || !user) return;

   // Prevent sending if recipient has blocked us

   try {

       const blockedByRecipient = await hasBlocked(selectedUser.id, user.uid);

       if (blockedByRecipient) {

           alert('Cannot send message: You have been blocked by this user.');

           return;

       }

   } catch (e) {

       console.warn('Block check failed before sending', e);

   }

 

 if (!userDecryptionKey) {

 

     alert("Cannot send message: Your private key is not unlocked.");

 

     checkAndUnlockKey(user);

 

     return;

 

 }

 

 

 

 try {

 

 console.log("Send message function started");

 

     const recipientDoc = await db.collection('users').doc(selectedUser.id).get();

 

     const recipientPublicKey = recipientDoc.data()?.publicKey;

 

     const senderDoc = await db.collection('users').doc(user.uid).get();

 

     const senderPublicKey = senderDoc.data()?.publicKey;

 

 

 

     if (!recipientPublicKey || !senderPublicKey) return alert("Missing encryption keys. Cannot send secure message.");

 

 

 

     const encryptedForRecipient = await encryptText(text, recipientPublicKey);

 

     const encryptedForSender = await encryptText(text, senderPublicKey);

 

 

 

     const chatId = [user.uid, selectedUser.id].sort().join('_');

 

     console.log("Plain text message:", text);

 

     console.log("Encrypted for recipient:", encryptedForRecipient);

 

     console.log("Encrypted for sender:", encryptedForSender);

 

 

 

     const timestamp = firebase.firestore.FieldValue.serverTimestamp();

 

 

 

     // --------------------------------------------------------------------------

 

     // 1. Write the message to the main chats collection (Existing Logic)

 

     // --------------------------------------------------------------------------

 

     await db.collection('chats').doc(chatId).collection('messages').add({

 

         senderId: user.uid,

 

         recipientId: selectedUser.id,

 

         text: encryptedForRecipient,

 

         senderText: encryptedForSender,

 

         timestamp: timestamp, // Use the shared timestamp

 

         read: false,

 

     });

 

 

 

     // --------------------------------------------------------------------------

 

     // 2. NEW LOGIC: Update the active chat list for both users (The Fix)

 

     // --------------------------------------------------------------------------

 

     const chatUpdateData = { lastMessageAt: timestamp };

 

 

 

     // A. Update SENDER's list

 

     await db.collection('userChats').doc(user.uid).collection('list').doc(selectedUser.id).set(chatUpdateData, { merge: true });

 

 

 

     // B. Update RECEIVER's list

 

     await db.collection('userChats').doc(selectedUser.id).collection('list').doc(user.uid).set(chatUpdateData, { merge: true });

 

 

 

     // --------------------------------------------------------------------------

 

     // 3. UI Cleanup (Existing Logic)

 

     // --------------------------------------------------------------------------

 

     if(input) input.value = '';

 

     

 

     // Stop typing indicator

 

     if (typingTimeout) clearTimeout(typingTimeout);

 

     await updateTypingStatus(false);

 

   

 

 } catch (error) {

 

     console.error("Error sending message or encryption failed:", error);

 

     alert("Failed to send message: " + error.message);

 

 }

 

}

 

 

 

// Function: updateTypingStatus (Updates user's typing status in the chat)

 

async function updateTypingStatus(isTyping) {

 

  if (!selectedUser || !user) return;

 

 

 

  const chatId = [user.uid, selectedUser.id].sort().join('_');

 

 

 

  try {

 

      await db.collection('chats').doc(chatId).set({

 

          [user.uid + '_typing']: isTyping,

 

          [user.uid + '_typingAt']: isTyping ? firebase.firestore.FieldValue.serverTimestamp() : null

 

      }, { merge: true });

 

  } catch (error) {

 

      console.error("Error updating typing status:", error);

 

  }

 

}

 

 

 

// Function: listenToTypingStatus (Listens for recipient's typing status)

 

function listenToTypingStatus() {

 

  if (!selectedUser || !user) return;

 

 

 

  const chatId = [user.uid, selectedUser.id].sort().join('_');

 

 

 

  // Unsubscribe from previous listener

 

  if (typingListenerUnsubscribe) {

 

      typingListenerUnsubscribe();

 

  }

 

 

 

  typingListenerUnsubscribe = db.collection('chats').doc(chatId).onSnapshot((doc) => {

 

      const data = doc.data() || {};

 

      const isRecipientTyping = data[selectedUser.id + '_typing'] || false;

 

     

 

      const typingIndicator = document.getElementById('typing-indicator');

 

     

 

      if (isRecipientTyping && typingIndicator) {

 

          typingIndicator.style.display = 'block';

 

      } else if (typingIndicator) {

 

          typingIndicator.style.display = 'none';

 

      }

 

  });

 

}

 

 

 

// Function: showLinkWarning (Shows a confirmation dialog before opening a link)

 

function showLinkWarning(url) {

 

  return new Promise((resolve) => {

 

      // Create modal overlay

 

      const modal = document.createElement('div');

 

      modal.classList.add('link-warning-modal');

 

      modal.style.display = 'flex';

 

     

 

      // Create modal content

 

      const modalContent = document.createElement('div');

 

      modalContent.classList.add('link-warning-content');

 

     

 

      // Title

 

      const title = document.createElement('h3');

 

      title.textContent = '⚠️ Warning: Opening External Link';

 

      title.style.marginTop = '0';

 

      modalContent.appendChild(title);

 

     

 

      // Message

 

      const message = document.createElement('p');

 

      message.textContent = 'You are about to open an external link. Only proceed if you trust the sender.';

 

      message.style.color = '#666';

 

      modalContent.appendChild(message);

 

     

 

      // URL display

 

      const urlBox = document.createElement('div');

 

      urlBox.classList.add('link-warning-url');

 

      urlBox.textContent = url;

 

      modalContent.appendChild(urlBox);

 

     

 

      // Button container

 

      const buttonContainer = document.createElement('div');

 

      buttonContainer.classList.add('link-warning-buttons');

 

     

 

      // Cancel button

 

      const cancelBtn = document.createElement('button');

 

      cancelBtn.textContent = 'Cancel';

 

      cancelBtn.classList.add('link-warning-btn', 'cancel-btn');

 

      cancelBtn.onclick = () => {

 

          modal.remove();

 

          resolve(false);

 

      };

 

      buttonContainer.appendChild(cancelBtn);

 

     

 

      // Open button

 

      const openBtn = document.createElement('button');

 

      openBtn.textContent = 'Open Link';

 

      openBtn.classList.add('link-warning-btn', 'open-btn');

 

      openBtn.onclick = () => {

 

          modal.remove();

 

          window.open(url, '_blank', 'noopener,noreferrer');

 

          resolve(true);

 

      };

 

      buttonContainer.appendChild(openBtn);

 

     

 

      modalContent.appendChild(buttonContainer);

 

      modal.appendChild(modalContent);

 

      document.body.appendChild(modal);

 

  });

 

}

 

 

 

// Function: parseMessageLinks (Converts URLs in text to clickable links)

 

function parseMessageLinks(text) {

 

  // Regex to match URLs

 

  const urlRegex = /(https?:\/\/[^\s]+)/gi;

 

  const parts = text.split(urlRegex);

 

 

 

  const container = document.createElement('div');

 

 

 

  for (let i = 0; i < parts.length; i++) {

 

      if (urlRegex.test(parts[i])) {

 

          const link = document.createElement('a');

 

          const url = parts[i];

 

          link.href = '#';

 

          link.textContent = url;

 

          link.style.color = '#2563eb';

 

          link.style.textDecoration = 'underline';

 

          link.style.cursor = 'pointer';

 

          link.onclick = async (e) => {

 

              e.preventDefault();

 

              await showLinkWarning(url);

 

          };

 

          container.appendChild(link);

 

      } else if (parts[i]) {

 

          container.appendChild(document.createTextNode(parts[i]));

 

      }

 

  }

 

 

 

  return container;

 

}

 

 

 

// Function: renderMessage (Displays the message in the chat window)

 

async function renderMessage(message) {

 

  const messagesDiv = document.getElementById('messages');

 

  const messageContainer = document.createElement('div');

 

  const isMyMessage = message.senderId === user.uid;

 

 

 

  messageContainer.style.textAlign = isMyMessage ? 'right' : 'left';

 

 

 

  // ============================================================

 

  // STEP 5 — SAFETY CHECK (Toxic / Scam / Phishing)

 

  // ============================================================

 

  let safety = await checkMessageSafety(message.text);

 

  // safety = { flagged: true/false, reason: "Toxic / Scam / Abuse..." }

 

 

 

  // UI Styles

 

  const contentDiv = document.createElement('div');

 

  contentDiv.classList.add('message-box');

 

 

 

  // Parse links in message text

 

  const parsedContent = parseMessageLinks(message.text);

 

  contentDiv.appendChild(parsedContent);

 

 

 

  if (isMyMessage) {

 

      contentDiv.style.backgroundColor = '#2563eb';

 

      contentDiv.style.color = 'white';

 

  } else {

 

      contentDiv.style.backgroundColor = '#e0e7ff';

 

      contentDiv.style.color = 'black';

 

  }

 

 

 

  // ============================================================

 

  //  STEP 6 — If message harmful → add warning bubble

 

  // ============================================================

 

  if (safety.flagged) {

 

      const warningDiv = document.createElement('div');

 

      warningDiv.classList.add('warning-box');

 

      warningDiv.style.color = 'red';

 

      warningDiv.style.fontSize = '12px';

 

      warningDiv.style.marginTop = '4px';

 

      warningDiv.textContent = `⚠️ Warning: ${safety.reason}`;

 

      messageContainer.appendChild(warningDiv);

 

  }

 

 

 

  // Time bubble with delivery/read status

 

  const timeDiv = document.createElement('div');

 

  timeDiv.classList.add('message-time');

 

  const date = message.timestamp?.toDate ? message.timestamp.toDate() : new Date();

 

  let timeText = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

 

 

 

  // Add status tick for sent messages

 

  if (isMyMessage) {

 

      let statusIcon = '';

 

      if (message.read) {

 

          // Message has been read

 

          statusIcon = '<span class="read-tick">✓✓</span>';

 

      } else {

 

          // Message has been delivered but not read

 

          statusIcon = '<span class="delivered-tick">✓</span>';

 

      }

 

      timeDiv.innerHTML = `${statusIcon} ${timeText}`;

 

  } else {

 

      timeDiv.textContent = timeText;

 

  }

 

  timeDiv.style.fontSize = '12px';

 

  timeDiv.style.marginTop = '4px';

 

 

 

  // Add message to UI

 

  messageContainer.appendChild(contentDiv);

 

  messageContainer.appendChild(timeDiv);

 

   messagesDiv.appendChild(messageContainer);

 // Auto-scroll smoothly when a new message is rendered

 try { scrollToBottom(); } catch(e) { /* ignore */ }

 

}

 

 

 

async function searchUser() {

 

 const searchUsernameInput = document.getElementById('search-username');

 

 const searchUsername = searchUsernameInput?.value.trim();

 

 if (!searchUsername) return alert("Please enter a unique username.");

 

 

 

 const cleanUsername = searchUsername.startsWith('@') ? searchUsername.substring(1) : searchUsername;

 

 

 

 try {

 

     const usernameDoc = await db.collection('usernames').doc(cleanUsername).get();

 

 

 

     if (usernameDoc.exists) {

 

         const foundUid = usernameDoc.data().uid;

 

         const userProfileDoc = await db.collection('users').doc(foundUid).get();

 

       

 

         if (userProfileDoc.exists) {

 

             const foundUser = { id: foundUid, ...userProfileDoc.data() };

 

             selectUser(foundUser.id, foundUser);

 

             alert(`Found user: @${foundUser.username || foundUser.name}. Opening chat.`);

 

         } else {

 

             alert("User profile data not found.");

 

         }

 

     } else {

 

         alert(`Username @${cleanUsername} not found.`);

 

     }

 

 } catch(error) {

 

     console.error("Search error:", error);

 

     alert("Search failed.");

 

 }

 

   // Ensure view jumps to bottom after navigation

   scrollToBottom(true);

 

}

 

 

 

function updateChatList(snapshot) {

 

 const chatList = document.getElementById('chat-list');

 

 if(!chatList) return;

 

 

 

 chatList.innerHTML = '';

 

 snapshot.forEach(doc => {

 

     const userData = doc.data();

 

     if (doc.id !== user.uid) {

 

         const chatItem = document.createElement('div');

 

         chatItem.onclick = () => selectUser(doc.id, userData);

 

       

 

         const displayName = userData.name || doc.id.substring(0, 8);

 

         const displayUsername = userData.username ? `@${userData.username}` : 'No Username';

 

       

 

         chatItem.innerHTML = `

 

             <img src="${userData.photoURL || DEFAULT_PHOTO_URL}" alt="${displayName}" />

 

             <div>

 

                 <strong>${displayName}</strong>

 

                 <span class="status-dot ${userData.isOnline ? 'status-dot-online' : ''}"></span>

 

                 <p style="font-size: 12px; color: #6b7280; margin: 0;">${displayUsername}</p>

 

             </div>

 

         `;

 

         chatList.appendChild(chatItem);

 

     }

 

 });

 

}

 

 

 

function updateRecentUsersBar(snapshot) {

 

 const recentBar = document.getElementById('recent-users-bar');

 

 if(!recentBar) return;

 

 

 

 recentBar.innerHTML = '';

 

 snapshot.forEach(doc => {

 

     const userData = doc.data();

 

     if (doc.id !== user.uid) {

 

         const barItem = document.createElement('div');

 

         barItem.classList.add('recent-bar-item');

 

         barItem.onclick = () => selectUser(doc.id, userData);

 

       

 

         const displayShortId = userData.username ? `@${userData.username.substring(0, 4)}...` : userData.name.substring(0, 4) + '...';

 

 

 

         barItem.innerHTML = `

 

             <div class="profile-img-wrapper">

 

                 <img src="${userData.photoURL || DEFAULT_PHOTO_URL}" alt="${userData.name}" />

 

                 <span class="status-dot ${userData.isOnline ? 'status-dot-online' : ''}"></span>

 

             </div>

 

             <span>${displayShortId}</span>

 

         `;

 

         recentBar.appendChild(barItem);

 

     }

 

 });

 

}

 

 

 

function toggleSidebar() {

 

 document.getElementById('sidebar')?.classList.toggle('open');

 

}

 

 

 

function openSettingsModal() {
 document.getElementById('settings-modal')?.classList.remove('hidden');
  db.collection('users').doc(user.uid).get().then(doc => {
    if (doc.exists) {

          const data = doc.data();
        document.getElementById('edit-username').value = data.username || '';
        document.getElementById('edit-name').value = data.name || user.email.split('@')[0];
       document.getElementById('current-profile-photo').src = data.photoURL || DEFAULT_PHOTO_URL;
    }
});

 }
function closeSettingsModal() {

document.getElementById('settings-modal')?.classList.add('hidden');
}

 

 

 

async function saveProfileChanges() {

 

  const newUsername = document.getElementById('edit-username')?.value.trim();

 

  const newName = document.getElementById('edit-name')?.value.trim();

 

  const fileInputEl = document.getElementById('upload-profile-photo');

 

  const photoFile = fileInputEl?.files && fileInputEl.files[0];

 

  const photoUrlManual = document.getElementById('edit-photo-url-manual')?.value.trim();

 

 let newPhotoURL = null;

 

 

 

 const userRef = db.collection('users').doc(user.uid);

 

 const userDoc = await userRef.get();

 

 const currentData = userDoc.data() || {};

 

 const currentUsername = currentData.username;

 

 

 

 let updates = {};

 

 let authUpdates = {};

 

 let success = true;

 

 

 

 if (!newUsername) return alert("Username cannot be empty.");

 

 

 

 if (newUsername !== currentUsername) {

 

     if (!isValidUsername(newUsername)) return alert("Invalid username.");

 

     // checkUsernameAvailability() returns TRUE if username is AVAILABLE.

 

     // We must alert if it's NOT available.

 

     if (!(await checkUsernameAvailability(newUsername))) return alert(`Username @${newUsername} is already taken.`);

 

   

 

     const batch = db.batch();

 

     if (currentUsername) batch.delete(db.collection('usernames').doc(currentUsername));

 

     batch.set(db.collection('usernames').doc(newUsername), { uid: user.uid });

 

     updates.username = newUsername;

 

 

 

     try {

 

         await batch.commit();

 

     } catch (error) {

 

         console.error("Username update failed:", error);

 

         alert("Failed to update username due to a database error.");

 

         return;

 

     }

 

 }

 

 

 

 if (photoUrlManual) {

 

     newPhotoURL = convertGoogleDriveLink(photoUrlManual);

 

  } else if (photoFile) {

 

      try {

 

          // Prefer the storage bucket configured in Firebase options

 

          const configuredBucket = firebase?.app()?.options?.storageBucket;

 

          let uploadRef;

 

          if (configuredBucket) {

 

              uploadRef = firebase.storage().refFromURL(`gs://${configuredBucket}`).child(`profile_photos/${user.uid}/${photoFile.name}`);

 

          } else {

 

              // Fallback: replace 'YOUR_BUCKET_NAME' with your actual bucket name (e.g., my-project-12345.appspot.com)

 

              const FALLBACK_BUCKET = 'YOUR_BUCKET_NAME.appspot.com';

 

              uploadRef = firebase.storage().refFromURL(`gs://${FALLBACK_BUCKET}`).child(`profile_photos/${user.uid}/${photoFile.name}`);

 

          }

 

 

 

          const snapshot = await uploadRef.put(photoFile);

 

          // snapshot.ref here may be a Reference from refFromURL; use its getDownloadURL()

 

          newPhotoURL = await snapshot.ref.getDownloadURL();

 

      } catch (error) {

 

          console.error("Photo upload failed:", error);

 

          alert("Photo upload failed. Check console for details and ensure your storage bucket is configured.");

 

          return;

 

      }

 

  }

 

 

 

 if (newName && newName !== currentData.name) {

 

     updates.name = newName;

 

     authUpdates.displayName = newName;

 

 }

 

 

 

 if (newPhotoURL) {

 

     updates.photoURL = newPhotoURL;

 

     authUpdates.photoURL = newPhotoURL;

 

 }

 

 

 

 if (Object.keys(authUpdates).length > 0) {

 

     try {

 

         await user.updateProfile(authUpdates);

 

     } catch (error) {

 

         console.error("Firebase Auth profile update failed:", error);

 

         alert("Warning: Auth profile update failed.");

 

         success = false;

 

     }

 

 }

 

 

 

 if (Object.keys(updates).length > 0) {

 

     try {

 

         await userRef.update(updates);

 

     } catch (error) {

 

         console.error("Firestore profile update failed:", error);

 

         alert("Error: Failed to update profile details in Firestore.");

 

         success = false;

 

     }

 

 }

 

 

 

 if (success) {

 

     await user.reload();

 

    // Update immediate preview and UI

 

    if (newPhotoURL) {

 

        try {

 

            document.getElementById('current-profile-photo').src = newPhotoURL;

 

            // Also update any other avatar images in the UI (sidebar header etc.)

 

            const sidebarAvatar = document.querySelectorAll('img[src^="data:"]');

 

        } catch (err) {

 

            console.warn('Failed to update preview image after save:', err);

 

        }

 

        // clear file input to avoid resubmitting same blob

 

        if (fileInputEl) fileInputEl.value = '';

 

    }

 

     initializeChatListeners(user);

 

     alert("Profile updated successfully!");

 

     closeSettingsModal();

 

 }

 

}

 

 

 

firebase.auth().onAuthStateChanged((user) => {

 

const loginPage = document.getElementById("login-page");

 

const chatApp = document.getElementById("chat-app");

 

 

 

if (user) {

 

  // Logged in

 

  loginPage.style.display = "none";

 

  chatApp.style.display = "flex"; // or "block" depending on your CSS

 

  document.body.style.overflow = "auto";

 

} else {

 

  // Logged out

 

  loginPage.style.display = "flex";

 

  chatApp.style.display = "none";

 

  document.body.style.overflow = "hidden";

 

}

 

});

 

 

 

 

 

async function checkMessageSafety(text) {

 // RULE 1 — Toxicity / Abuse
 const toxicWords = ["fuck", "bitch", "kill you", "nude", "slut", "idiot", "hate you","madarchod"];
const toxicDetected = toxicWords.some(w => text.toLowerCase().includes(w));
if (toxicDetected) {
     return { flagged: true, reason: "Message contains abusive or harmful language" };
 }
// RULE 2 — Scam / Phishing Pattern
  const scamPatterns = [
     /free money/i,
    /click here/i,
    /verify your bank/i,
      /your account will be closed/i,
     /lottery/i,
     /gift card/i,
     /bitcoin investment/i
 ];
 if (scamPatterns.some(p => p.test(text))) {
    return { flagged: true, reason: "Message looks like a scam or phishing" };
}
  // RULE 3 — Suspicious Links
  const link = /https?:\/\/[^\s]+/i;
 if (link.test(text)) {
     return { flagged: true, reason: "Message contains a suspicious link" };
 }
 return { flagged: false };
}

 

 

 

 

 

let emojiPickerInitialized = false;

 

 

 

function toggleEmojiPicker() {

 

  const pickerDiv = document.getElementById("emoji-picker");

 

  const input = document.getElementById("message-input");

 

  if (!pickerDiv) return;

 

 

 

  // Ensure the picker container is attached to body so it won't push page height

 

  if (pickerDiv.parentElement !== document.body) document.body.appendChild(pickerDiv);

 

 

 

  if (!emojiPickerInitialized) {

 

      const picker = new EmojiMart.Picker({

 

          onEmojiSelect: (emoji) => {

 

              const inputEl = document.getElementById("message-input");

 

              if (inputEl) {

 

                  inputEl.value += emoji.native;

 

                  inputEl.focus();

 

              }

 

              pickerDiv.classList.add("hidden");

 

          },

 

          theme: "light",

 

          previewPosition: "none"

 

      });

 

 

 

      // Add a small dismiss/close button inside the picker container

 

      const closeBtn = document.createElement('button');

 

      closeBtn.type = 'button';

 

      closeBtn.className = 'emoji-picker-close';

 

      closeBtn.setAttribute('aria-label', 'Close emoji picker');

 

      closeBtn.innerHTML = '✕';

 

      closeBtn.addEventListener('click', (ev) => {

 

          ev.stopPropagation();

 

          pickerDiv.classList.add('hidden');

 

      });

 

 

 

      // Ensure the close button appears before the picker content

 

      pickerDiv.appendChild(closeBtn);

 

      pickerDiv.appendChild(picker);

 

      emojiPickerInitialized = true;

 

  }

 

 

 

  const isHidden = pickerDiv.classList.contains('hidden');

 

 

 

  if (isHidden) {

 

      // Make picker fixed and constrain height so it doesn't force page scroll

 

      pickerDiv.classList.remove('hidden');

 

      pickerDiv.style.position = 'fixed';

 

      pickerDiv.style.zIndex = '10000';

 

      pickerDiv.style.maxHeight = '70vh';

 

      pickerDiv.style.overflow = 'auto';

 

      pickerDiv.style.display = 'block';

 

 

 

      // Compute placement near the input but keep it inside viewport

 

      const rect = input ? input.getBoundingClientRect() : { left: 12, right: 12, top: window.innerHeight - 80, bottom: window.innerHeight - 40 };

 

      const vh = window.innerHeight;

 

      const vw = window.innerWidth;

 

      const pickerHeight = pickerDiv.offsetHeight || 320;

 

      const pickerWidth = pickerDiv.offsetWidth || Math.min(360, vw - 16);

 

 

 

      const spaceBelow = vh - rect.bottom;

 

      let top;

 

      if (spaceBelow >= pickerHeight + 8) {

 

          top = rect.bottom + 8;

 

      } else if (rect.top >= pickerHeight + 8) {

 

          top = rect.top - pickerHeight - 8;

 

      } else {

 

          top = Math.max(8, (vh - pickerHeight) / 2);

 

      }

 

 

 

      let left = rect.left + 8;

 

      if (left + pickerWidth > vw - 8) left = vw - pickerWidth - 8;

 

      if (left < 8) left = 8;

 

 

 

      pickerDiv.style.top = top + 'px';

 

      pickerDiv.style.left = left + 'px';

 

      pickerDiv.style.maxWidth = Math.min(pickerWidth, vw - 16) + 'px';

 

  } else {

 

      pickerDiv.classList.add('hidden');

 

      pickerDiv.style.display = '';

 

  }

 

}

 

const messageInput = document.getElementById("message-input");

 

 

 

// Add typing indicator listener

 

messageInput.addEventListener("input", async function () {

 

  if (!selectedUser) return;

 

 

 

  // Clear previous timeout

 

  if (typingTimeout) clearTimeout(typingTimeout);

 

 

 

  // Send typing status

 

  await updateTypingStatus(true);

 

 

 

  // Set timeout to stop typing indicator after 3 seconds of no input

 

  typingTimeout = setTimeout(async () => {

 

      await updateTypingStatus(false);

 

  }, 3000);

 

});

 

 

 

messageInput.addEventListener("keydown", function (event) {

 

if (event.key === "Enter") {

 

  event.preventDefault(); // stop new line

 

  sendMessage();          // send message

 

}

 

});

 

function toggleSidebar() {

 

const sidebar = document.getElementById('sidebar');

 

sidebar.classList.toggle('active');

 

}

 

 

 

// Ensure it closes when a user is clicked (Good for mobile UX)

 

function onUserSelected() {

 

  // Your logic to load messages...

 

 

 

  // Auto-close sidebar on mobile

 

  if (window.innerWidth <= 768) {

 

      document.getElementById('sidebar').classList.remove('active');

 

  }

 

}

 

 

 

// Close sidebar when a username or recent chat item is clicked (mobile behaviour)

 

document.addEventListener('DOMContentLoaded', () => {

 

  const sidebar = document.querySelector('.sidebar');

 

  if (!sidebar) return;

 

 

 

  const closeBtn = document.querySelector('.close-sidebar-button');

 

 

 

  function closeSidebar() {

 

      if (closeBtn) {

 

          // Prefer triggering the existing close button (keeps behavior consistent)

 

          closeBtn.click();

 

          return;

 

      }

 

      // Fallback: remove common classes used to show the sidebar

 

      sidebar.classList.remove('open', 'active');

 

  }

 

 

 

  // Delegate clicks inside the sidebar. If the user taps a nav item or recent chat,

 

  // close the sidebar just like the X button would.

 

  sidebar.addEventListener('click', (e) => {

 

      const clickedItem = e.target.closest('nav div, .recent-bar-item, nav a, nav button');

 

      if (clickedItem) {

 

          closeSidebar();

 

      }

 

  });

 

});

 

 

 

// Preview profile photo when user selects a file or pastes a URL

 

document.addEventListener('DOMContentLoaded', () => {

 

  const fileInput = document.getElementById('upload-profile-photo');

 

  const manualUrlInput = document.getElementById('edit-photo-url-manual');

 

  const previewImg = document.getElementById('current-profile-photo');

 

  if (!previewImg) return;

 

 

 

  let currentObjectUrl = null;

 

 

 

  function revokeCurrentUrl() {

 

      if (currentObjectUrl) {

 

          try { URL.revokeObjectURL(currentObjectUrl); } catch (err) { /* ignore */ }

 

          currentObjectUrl = null;

 

      }

 

  }

 

 

 

  fileInput?.addEventListener('change', (e) => {

 

      const file = e.target.files && e.target.files[0];

 

      if (!file) return;

 

      if (!file.type.startsWith('image/')) {

 

          alert('Please choose an image file.');

 

          fileInput.value = '';

 

          return;

 

      }

 

 

 

      revokeCurrentUrl();

 

      currentObjectUrl = URL.createObjectURL(file);

 

      previewImg.src = currentObjectUrl;

 

  });

 

 

 

  // If user pastes a URL, show preview (but do not validate external URL beyond basic check)

 

  manualUrlInput?.addEventListener('blur', (e) => {

 

      const url = e.target.value && e.target.value.trim();

 

      if (!url) return;

 

      // Basic sanity check

 

      if (!/^https?:\/\/.+/i.test(url)) return;

 

      revokeCurrentUrl();

 

      previewImg.src = url;

 

  });

 

 

 

  // Clean up object URL when modal closed or page unloads

 

  window.addEventListener('beforeunload', revokeCurrentUrl);

 

});

 

// ====================================================================

// PROFILE PICTURE MODAL FUNCTIONS

// ====================================================================

 

function openProfilePictureModal() {
if (!selectedUser) {
          alert('Please select a user first.');
               return;
 }
 const modal = document.getElementById('profile-picture-modal');
   const largeImg = document.getElementById('profile-picture-large');
   const nameDisplay = document.getElementById('profile-picture-name');
  largeImg.src = selectedUser.photoURL || DEFAULT_PHOTO_URL;
 nameDisplay.textContent = selectedUser.name || `@${selectedUser.username || 'Unknown User'}`;
   modal.classList.remove('hidden');
}
function closeProfilePictureModal() {
      const modal = document.getElementById('profile-picture-modal');
 modal.classList.add('hidden');

}
// Close modal when clicking outside of it
document.addEventListener('click', (e) => {
       const modal = document.getElementById('profile-picture-modal');
  if (e.target === modal) {
      closeProfilePictureModal();
  }
});

 

// Close modal when pressing Escape key

document.addEventListener('keydown', (e) => {

   if (e.key === 'Escape') {

       closeProfilePictureModal();

   }

});

 

 

// Select the buttons

const signUpBtn = document.getElementById('navbar-signup-btn');

const signInBtn = document.getElementById('navbar-signin-btn');

 

// Add click event to the Sign Up button

signUpBtn.addEventListener('click', () => {

 signUpBtn.classList.add('hidden');    // Hide Sign Up

 signInBtn.classList.remove('hidden'); // Show Sign In

});

 

// Optional: If you want to click "Sign In" to go back to "Sign Up"

signInBtn.addEventListener('click', () => {

 signInBtn.classList.add('hidden');

 signUpBtn.classList.remove('hidden');

});


function showRecentLoader(){
  document
    .getElementById("recent-loader")
    .classList.remove("hide");
}

function hideRecentLoader(){
  document
    .getElementById("recent-loader")
    .classList.add("hide");
}

function handleSearch(event){
    event.preventDefault(); // stop page reload
    searchUser();           // call your existing function
}
