import mongoose from "mongoose"

export const connect = async () => {
    try {
        const connection = await mongoose.connect(process.env.MONGODB_URI)
        console.log(`MONGODB CONNECTION OPEN!!! : ${connection.connection.host}`)
    }
    catch (error) {
        console.log("MongoDB connection error:", error)
    }
}