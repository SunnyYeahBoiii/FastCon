import { NextResponse } from "next/server";
import {
  getContestsForSubmitPicker,
  serializePublicContest,
} from "@/lib/contests";

// Public endpoint — contests available on the submit picker
export async function GET() {
  try {
    const now = new Date();
    const contests = await getContestsForSubmitPicker();
    return NextResponse.json({
      contests: contests.map((contest) => serializePublicContest(contest, now)),
    });
  } catch (error) {
    console.error("Fetch public contests error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
