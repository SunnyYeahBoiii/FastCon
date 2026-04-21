"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Eye, Trash2, Plus, X, UserPlus } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "contestant",
  });
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error("Fetch users error:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || "Lỗi khi tạo người dùng");
        return;
      }

      setShowCreateModal(false);
      setCreateForm({ name: "", email: "", password: "", role: "contestant" });
      fetchUsers();
    } catch (error) {
      setFormError("Lỗi kết nối");
    }
    setIsSubmitting(false);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/users/${userToDelete.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setShowDeleteModal(false);
        setUserToDelete(null);
        fetchUsers();
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
    setIsSubmitting(false);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <header className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">
            Quản lý người dùng
          </h1>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-lg font-semibold text-sm hover:shadow-lg transition-all"
        >
          <UserPlus className="w-4 h-4" />
          Thêm người dùng mới
        </button>
      </header>

      {/* Search */}
      <div className="mb-6 flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Tìm kiếm người dùng..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors w-64 text-sm text-on-surface placeholder-on-surface-variant"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(25,28,30,0.04)] overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-low text-on-surface-variant font-semibold text-sm border-b border-outline-variant/15">
              <th className="py-4 px-6 font-medium">Họ tên</th>
              <th className="py-4 px-6 font-medium">Email</th>
              <th className="py-4 px-6 font-medium">Vai trò</th>
              <th className="py-4 px-6 font-medium">Trạng thái</th>
              <th className="py-4 px-6 font-medium text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y divide-outline-variant/10">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-on-surface-variant">
                  Đang tải...
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-on-surface-variant">
                  Không tìm thấy người dùng
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-surface-container-low/50 transition-colors">
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-bold text-xs">
                        {getInitials(user.name)}
                      </div>
                      <span className="font-medium text-on-surface">{user.name}</span>
                    </div>
                  </td>
                  <td className="py-4 px-6 text-on-surface-variant">{user.email}</td>
                  <td className="py-4 px-6">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-primary-container text-on-primary"
                          : "bg-surface-container-high text-on-surface-variant"
                      }`}
                    >
                      {user.role === "admin" ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="py-4 px-6">
                    <div className="flex items-center gap-1.5 text-primary font-medium">
                      <div className="w-2 h-2 rounded-full bg-primary"></div>
                      Hoạt động
                    </div>
                  </td>
                  <td className="py-4 px-6 text-right">
                    <a
                      href={`/admin/users/${user.id}`}
                      className="p-2 text-on-surface-variant hover:text-primary transition-colors rounded hover:bg-surface-container-high mr-1 inline-block"
                    >
                      <Eye className="w-5 h-5" />
                    </a>
                    <button
                      onClick={() => {
                        setUserToDelete(user);
                        setShowDeleteModal(true);
                      }}
                      className="p-2 text-on-surface-variant hover:text-error transition-colors rounded hover:bg-error-container/50"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="bg-surface-container-lowest px-6 py-4 flex items-center justify-between border-t border-outline-variant/15">
          <span className="text-sm text-on-surface-variant">
            Hiển thị 1-{filteredUsers.length} của {users.length} người dùng
          </span>
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-high transition-colors text-on-surface-variant disabled:opacity-50">
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded bg-primary text-on-primary font-medium">
              1
            </button>
            <button className="w-8 h-8 flex items-center justify-center rounded hover:bg-surface-container-high transition-colors text-on-surface-variant">
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          />
          <div className="relative bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-on-surface">Thêm người dùng mới</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-on-surface-variant hover:text-on-surface rounded-lg hover:bg-surface-container-high transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              {formError && (
                <div className="bg-error-container/20 text-error rounded-lg px-4 py-2 text-sm">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1">
                  Họ tên
                </label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1">
                  Mật khẩu
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-on-surface-variant mb-1">
                  Vai trò
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  className="w-full px-4 py-2 bg-surface-container-highest rounded-lg border-none focus:ring-0 focus:border-b-2 focus:border-b-primary focus:bg-surface-container-lowest transition-colors text-sm text-on-surface"
                >
                  <option value="contestant">Thí sinh</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-surface-container-high text-on-surface-variant rounded-lg font-medium hover:bg-surface-container-high/80 transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 bg-gradient-to-br from-primary to-primary-container text-on-primary rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {isSubmitting ? "Đang tạo..." : "Lưu"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => {
              setShowDeleteModal(false);
              setUserToDelete(null);
            }}
          />
          <div className="relative bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-error-container text-error flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-on-surface mb-2">Xóa người dùng</h2>
              <p className="text-on-surface-variant mb-6">
                Bạn có chắc chắn muốn xóa người dùng <span className="font-medium text-on-surface">{userToDelete.name}</span>?
                <br />
                <span className="text-sm text-error">Tất cả bài nộp của họ cũng sẽ bị xóa.</span>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setUserToDelete(null);
                }}
                className="flex-1 px-4 py-2 bg-surface-container-high text-on-surface-variant rounded-lg font-medium hover:bg-surface-container-high/80 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-error text-on-error rounded-lg font-semibold hover:bg-error/90 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}