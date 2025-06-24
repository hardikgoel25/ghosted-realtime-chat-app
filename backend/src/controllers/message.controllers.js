import User from "../models/user.models.js";
import Message from "../models/message.models.js";

import cloudinary from "../library/cloudinary.js";
import { getReceiverSocketId, io } from "../library/socket.js"

export const getUsers = async (req, res) => {
    try {
        const loggedInUserId = req.user._id;
        // Find all users except logged in user who are not disabled or deleted
        const filteredUsers = await User.find({
            _id: { $ne: loggedInUserId },
            isDisabled: { $ne: true }
        }).select("-password");

        res.status(200).json(filteredUsers);
    } catch (error) {
        console.error("Error in getUsersForSidebar: ", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const getMessages = async (req, res) => {
    try {
        const { id: userToChatId } = req.params;
        const myId = req.user._id;

        // Check if either user is disabled or deleted
        const [me, otherUser] = await Promise.all([
            User.findById(myId),
            User.findById(userToChatId)
        ]);

        if (!me || me.isDisabled) {
            return res.status(403).json({ error: "Your account is disabled or does not exist." });
        }
        if (!otherUser || otherUser.isDisabled) {
            return res.status(403).json({ error: "The other user's account is disabled or does not exist." });
        }

        const messages = await Message.find({
            $or: [
                { senderId: myId, receiverId: userToChatId },
                { senderId: userToChatId, receiverId: myId },
            ],
        });

        res.status(200).json(messages);
    } catch (error) {
        console.log("Error in getMessages controller: ", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const { text, image } = req.body;
        const { id: receiverId } = req.params;
        const senderId = req.user._id;

        // Check if sender and receiver are valid and enabled
        const [sender, receiver] = await Promise.all([
            User.findById(senderId),
            User.findById(receiverId)
        ]);

        if (!sender || sender.isDisabled) {
            return res.status(403).json({ error: "Your account is disabled or does not exist." });
        }
        if (!receiver || receiver.isDisabled) {
            return res.status(403).json({ error: "The receiver's account is disabled or does not exist." });
        }

        let imageUrl;
        if (image) {
            // Upload base64 image to cloudinary
            const uploadResponse = await cloudinary.uploader.upload(image);
            imageUrl = uploadResponse.secure_url;
        }

        const newMessage = new Message({
            senderId,
            receiverId,
            text,
            image: imageUrl,
        });

        await newMessage.save();

        const receiverSocketId = getReceiverSocketId(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("newMessage", newMessage);
        }

        res.status(201).json(newMessage);
    } catch (error) {
        console.log("Error in sendMessage controller: ", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
};
