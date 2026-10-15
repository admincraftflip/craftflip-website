import { useEffect, useMemo, useState } from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth'
import { auth } from '../firebase'
import { AuthContext } from './AuthContext'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)
  // Firebase signs the new user in before the display name is saved; routes wait for this.
  const [registering, setRegistering] = useState(false)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser)
      setInitializing(false)
    })
    return unsubscribe
  }, [])

  const value = useMemo(() => {
    async function signInWithEmail(email, password) {
      await signInWithEmailAndPassword(auth, email, password)
    }

    async function registerWithEmail(displayName, email, password) {
      setRegistering(true)
      try {
        const credential = await createUserWithEmailAndPassword(auth, email, password)
        if (displayName) {
          await updateProfile(credential.user, { displayName })
          // Refresh the ID token so the backend receives the new name claim.
          await credential.user.getIdToken(true)
        }
      } finally {
        setRegistering(false)
      }
    }

    async function signInWithGoogle() {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({ prompt: 'select_account' })
      await signInWithPopup(auth, provider)
    }

    async function signOut() {
      await firebaseSignOut(auth)
    }

    return { user, initializing, registering, signInWithEmail, registerWithEmail, signInWithGoogle, signOut }
  }, [user, initializing, registering])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
