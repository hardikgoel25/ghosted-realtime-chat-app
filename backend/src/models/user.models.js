import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    fullname: {
        type: String,
        required: true,
        trim: true,
        maxLength: 40
    },
    username: {
        type: String,
        required: true,
        trim: true,
        maxLength: 25,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minLength: 8
    },
    bio: {
        type: String,
        default: "",
        maxLength: 160
    },
    gender: {
        type: String,
        required: true,
        enum: ['male', 'female', 'prefer not to say']
    },
    profilePic: {
        type: String,
        default: ""
    },
    isDisabled: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
export default User;