export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-surface relative">
      {/* Centered login card */}
      <div className="w-full max-w-md bg-surface-container-lowest p-8 md:p-10 rounded-xl shadow-[0_24px_40px_-15px_rgba(25,28,30,0.06)] relative z-10">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-on-surface tracking-tight font-body">
            Sign In
          </h1>
          <p className="text-on-surface-variant mt-2 text-sm font-body">
            Enter your credentials to access the workspace.
          </p>
        </div>

        {/* Login form */}
        <form action="#" method="POST" className="space-y-6">
          {/* Email input */}
          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-on-surface font-body"
              htmlFor="email"
            >
              Email
            </label>
            <input
              className="w-full bg-surface-container-highest border-0 rounded text-on-surface placeholder:text-outline focus:ring-0 focus:bg-surface-container-lowest focus:border-b-2 focus:border-primary transition-all duration-200 px-4 py-3 font-body"
              id="email"
              name="email"
              placeholder="Enter your email"
              required
              type="email"
            />
          </div>

          {/* Password input */}
          <div className="space-y-1.5">
            <label
              className="block text-sm font-medium text-on-surface font-body"
              htmlFor="password"
            >
              Password
            </label>
            <input
              className="w-full bg-surface-container-highest border-0 rounded text-on-surface placeholder:text-outline focus:ring-0 focus:bg-surface-container-lowest focus:border-b-2 focus:border-primary transition-all duration-200 px-4 py-3 font-body"
              id="password"
              name="password"
              placeholder="Enter your password"
              required
              type="password"
            />
          </div>

          {/* Login button with gradient */}
          <div className="pt-4">
            <button
              className="w-full bg-gradient-to-br from-primary to-primary-container text-on-primary font-medium rounded py-3 px-4 flex justify-center items-center hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface shadow-[0_4px_14px_0_rgba(0,61,155,0.2)] hover:shadow-[0_6px_20px_rgba(0,61,155,0.23)] font-body"
              type="submit"
            >
              Login
            </button>
          </div>
        </form>
      </div>

      {/* Ambient blur blobs background */}
      <div className="fixed top-0 left-0 w-full h-full overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-surface-container-low blur-[100px] opacity-70"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-primary-fixed-dim blur-[120px] opacity-20"></div>
      </div>
    </main>
  );
}