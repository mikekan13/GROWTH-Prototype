import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createFolder, listAccessibleFolders, getFolderInfo } from "@/services/google";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("id");

    if (folderId) {
      // Get specific folder info
      const folder = await getFolderInfo(folderId);
      return NextResponse.json({ folder });
    } else {
      // List all accessible folders
      const folders = await listAccessibleFolders();
      return NextResponse.json({ folders });
    }
  } catch (error) {
    console.error("Get folders error:", error);
    return NextResponse.json(
      { error: "Failed to fetch folders" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name, parentFolderId } = await request.json();

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Folder name is required" },
        { status: 400 }
      );
    }

    const folder = await createFolder(name.trim(), parentFolderId);

    return NextResponse.json({
      folder: {
        id: folder.id,
        name: folder.name,
        url: `https://drive.google.com/drive/folders/${folder.id}`,
      },
    });
  } catch (error) {
    console.error("Create folder error:", error);
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 }
    );
  }
}