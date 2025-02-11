/**
 * Projects Configuration
 * 
 * This module defines a list of projects with their details and provides a function
 * to get a random project for advertisement purposes.
 */

export interface Project {
    title: string;
    description: string;
    githubUrl: string;
    author: string;
    language?: string;
    stars?: number;
}

const projects: Project[] = [
    {
        title: "Vigilant Sniffle",
        description: "A starter template for Jekyll and Tailwind CSS with Daisy UI",
        githubUrl: "https://github.com/zxce3/vigilant-sniffle",
        author: "zxce3",
        language: "Liquid"
    },
    {
        title: "Zxce3",
        description: "Personal profile repository",
        githubUrl: "https://github.com/zxce3/zxce3",
        author: "zxce3",
        language: "JavaScript"
    },
    {
        title: "Userbot",
        description: "Simple Userbot template",
        githubUrl: "https://github.com/zxce3/userbot",
        author: "zxce3",
        language: "Python"
    },
    {
        title: "Perintah Linux",
        description: "Daftar perintah linux dalam bahasa indonesia",
        githubUrl: "https://github.com/zxce3/perintah-linux",
        author: "zxce3",
        language: "SCSS",
        stars: 2
    },
    {
        title: "Video Stream Beta",
        description: "Video streaming project (new update on link below)",
        githubUrl: "https://github.com/zxce3/video-stream-beta",
        author: "zxce3",
        language: "Python",
        stars: 12
    }
];

/**
 * Returns a random project from the list.
 */
export function getRandomProjectAd(): Project {
    return projects[Math.floor(Math.random() * projects.length)];
}
