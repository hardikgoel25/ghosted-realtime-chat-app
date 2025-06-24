import User from "../models/user.models.js";
import Message from "../models/message.models.js";
import bcrypt from "bcryptjs";
import { generateToken } from "../library/utility.js";
import cloudinary from "../library/cloudinary.js";

export const signup = async (req, res) => {
    try {
        let { fullname, username, password, gender } = req.body;
        username = username.toLowerCase();
        fullname = titleCase(fullname.trim());

        if (!fullname || !username || !password || !gender) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        const user = await User.findOne({ username });
        if (user) {
            return res.status(400).json({ message: "User already exists!" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const profilePic = `https://avatar.iran.liara.run/username?username=${fullname}`;

        const newUser = new User({
            fullname,
            username,
            password: hashedPassword,
            gender,
            profilePic,
        });

        generateToken(newUser._id, res);
        await newUser.save();

        res.status(201).json({
            message: "User registered successfully!",
            user: newUser
        });
    } catch (error) {
        console.error("Error in signup controller:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const login = async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        if (user.isDisabled) {
            return res.status(403).json({
                message: "Your account has been disabled. Please contact support or enable your account to proceed."
            });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        generateToken(user._id, res);

        res.status(200).json({
            message: "User logged in successfully!",
            user
        });
    } catch (error) {
        console.error("Error in login controller:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const logout = (req, res) => {
    try {
        res.cookie("jwt", "", { maxAge: 0 });
        res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
        console.error("Error in logout controller:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const { profilePic, bio, gender } = req.body;
        const userId = req.user._id;
        const updateData = {};

        if (profilePic) {
            const uploadResponse = await cloudinary.uploader.upload(profilePic);
            updateData.profilePic = uploadResponse.secure_url;
        }

        if (bio !== undefined) updateData.bio = bio;

        if (gender !== undefined) {
            if (!['male', 'female', 'prefer not to say'].includes(gender)) {
                return res.status(400).json({ message: "Invalid gender value" });
            }
            updateData.gender = gender;
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });
        res.status(200).json(updatedUser);
    } catch (error) {
        console.error("Error in update profile:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const checkAuth = (req, res) => {
    try {
        res.status(200).json(req.user);
    } catch (error) {
        console.error("Error in checkAuth controller:", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

export const deleteProfile = async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ message: "Incorrect password" });
        }

        await User.findByIdAndDelete(userId);
        await Message.deleteMany({
            $or: [{ senderId: userId }, { receiverId: userId }]
        });

        res.cookie("jwt", "", { maxAge: 0 });
        res.status(200).json({ message: 'Account deleted successfully!' });
    } catch (error) {
        console.error("Error deleting account:", error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const disableAccount = async (req, res) => {
    try {
        const { password } = req.body;
        const userId = req.user._id;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ message: "Incorrect password" });
        }

        user.isDisabled = true;
        await user.save();

        res.cookie("jwt", "", { maxAge: 0 });
        res.status(200).json({ message: 'Account disabled successfully', user });
    } catch (error) {
        console.error("Error disabling account:", error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

export const enableAccount = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: "Username and password are required" });
        }

        const user = await User.findOne({ username: username.toLowerCase() });

        if (!user) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        if (!user.isDisabled) {
            return res.status(400).json({ message: "Account is already enabled" });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            return res.status(400).json({ message: "Invalid credentials" });
        }

        user.isDisabled = false;
        await user.save();

        res.status(200).json({ message: "Account enabled successfully", user });
    } catch (error) {
        console.error("Error enabling account:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
};

function titleCase(str) {
    return str.toLowerCase().split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}
