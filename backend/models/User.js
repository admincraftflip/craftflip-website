import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    // The only identity key (unique index). Users are never matched or merged by email.
    firebaseUid: { type: String, required: true, unique: true },
    // Optional and not unique: some providers (e.g. Facebook) may not return an email.
    email: { type: String, trim: true, lowercase: true, default: null },
    displayName: { type: String, trim: true, default: null },
    photoURL: { type: String, default: null },
    plan: { type: String, enum: ['free', 'starter', 'pro'], default: 'free' },
    paddleCustomerId: { type: String, default: null },
  },
  { timestamps: true }
)

userSchema.methods.toProfile = function toProfile() {
  return {
    id: this._id,
    email: this.email,
    displayName: this.displayName,
    photoURL: this.photoURL,
    plan: this.plan,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  }
}

const User = mongoose.model('User', userSchema)

export default User
