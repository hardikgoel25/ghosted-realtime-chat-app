import { useState } from "react";
import { useAuthStore } from "../store/useAuthStore";

export default function AccountSettings() {
    const { authUser, disableAccount, deleteAccount, isDisablingAccount, isDeletingAccount } = useAuthStore();

    if (!authUser) return null;
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showDisableModal, setShowDisableModal] = useState(false);

    const [password, setPassword] = useState("");
    const [agreementText, setAgreementText] = useState("");

    const resetModalState = () => {
        setPassword("");
        setAgreementText("");
        setShowDeleteModal(false);
        setShowDisableModal(false);
    };

    const handleDisableConfirm = async () => {
        if (!password) return;
        await disableAccount(password);
        resetModalState();
    };

    const handleDeleteConfirm = async () => {
        if (!password || agreementText !== "I agree") return;
        await deleteAccount(password);
        resetModalState();
    };

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold mb-2">Account Settings</h2>
                <p className="text-sm text-base-content/70">Manage your account preferences and status here.</p>
            </div>

            {/* Disable Account Section */}
            <div className="border border-base-300 rounded-lg p-4 bg-base-100">
                <h3 className="text-md font-medium mb-1">Disable Account</h3>
                <p className="text-sm text-base-content/70 mb-4">
                    Temporarily deactivate your account. You can reactivate it by logging in again.
                </p>
                <button
                    className="btn btn-outline btn-warning"
                    onClick={() => setShowDisableModal(true)}
                    disabled={isDisablingAccount}
                >
                    {isDisablingAccount ? "Disabling..." : "Disable Account"}
                </button>
            </div>

            {/* Delete Account Section */}
            <div className="border border-base-300 rounded-lg p-4 bg-base-100">
                <h3 className="text-md font-medium mb-1">Delete Account</h3>
                <p className="text-sm text-base-content/70 mb-4">
                    Permanently delete your account and all associated data. This action is irreversible.
                </p>
                <button
                    className="btn btn-error text-error-content"
                    onClick={() => setShowDeleteModal(true)}
                    disabled={isDeletingAccount}
                >
                    {isDeletingAccount ? "Deleting..." : "Delete Account"}
                </button>
            </div>

            {/* Shared Modal Component */}
            {(showDeleteModal || showDisableModal) && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-base-100 rounded-lg shadow-lg p-6 w-full max-w-md space-y-4 border border-base-300">
                        <h2 className={`text-xl font-semibold ${showDeleteModal ? "text-error" : "text-warning"}`}>
                            {showDeleteModal ? "Confirm Deletion" : "Confirm Disable"}
                        </h2>

                        <p className="text-sm">
                            {showDeleteModal
                                ? "This will permanently delete your account and all data."
                                : "This will temporarily disable your account. You can reactivate it by logging in again."}
                        </p>

                        <p className="text-sm font-medium text-warning">
                            Please enter your password to confirm.
                        </p>

                        <input
                            type="password"
                            placeholder="Enter your password"
                            className="input input-bordered w-full"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />

                        {showDeleteModal && (
                            <input
                                type="text"
                                placeholder='Type "I agree" to confirm'
                                className="input input-bordered w-full"
                                value={agreementText}
                                onChange={(e) => setAgreementText(e.target.value)}
                            />
                        )}

                        <div className="flex justify-end space-x-3">
                            <button className="btn btn-ghost" onClick={resetModalState}>
                                Cancel
                            </button>
                            <button
                                className={`btn ${showDeleteModal ? "btn-error text-error-content" : "btn-warning"}`}
                                onClick={showDeleteModal ? handleDeleteConfirm : handleDisableConfirm}
                                disabled={
                                    !password ||
                                    (showDeleteModal && agreementText !== "I agree")
                                }
                            >
                                {showDeleteModal ? "Confirm Delete" : "Confirm Disable"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
