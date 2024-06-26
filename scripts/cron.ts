import path from "node:path";
import { Octokit } from "npm:octokit";
import { Builder, readJSON, Transpiler } from "jsr:@delu/tailor";
import build from "./build-shared.ts";

const octokit = new Octokit();

async function fetchCommitsSince(opts: { owner: string, repo: string, sinceDate: Date; }) {
	const query = `
   {
      repository(owner: "${opts.owner}", name: "${opts.repo}") {
         defaultBranchRef {
            target {
               ... on Commit {
                  history(first: 100, since: "${opts.sinceDate.toISOString()}") {
                     nodes {
                        oid
                     }
                  }
               }
            }
         }
      }
   }`;

	const result: any = await octokit.graphql(query);

	return result.repository.defaultBranchRef.target.history.nodes.map((node: any) => node.oid);
}

async function fetchAddedFiles(opts: { owner: string, repo: string, commit: string; }) {
	const c = await octokit.rest.repos.compareCommitsWithBasehead({
		owner: opts.owner,
		repo: opts.repo,
		basehead: opts.commit + "^...HEAD",
	});
	const addedFiles = c!.data.files!.filter(file => file.status === "added");
	return addedFiles;
}

const owner = "spicetify";
const repo = "classmap";
const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

const commits = await fetchCommitsSince({ owner, repo, sinceDate });

if (commits.length) {
	const earlistCommit = commits.at(-1);
	const allAddedFiles = await fetchAddedFiles({ owner, repo, commit: earlistCommit });


	const classmapPathRe = /^(?<version>\d+\.\d+\.\d+)\/classmap-(?<timestamp>\d{13})\.json$/;
	const classmapInfos = (await Promise.all(allAddedFiles.map(async file => {
		const match = file.filename.match(classmapPathRe);
		if (!match) {
			return [];
		}
		const { version, timestamp } = match.groups!;
		const classmap = await fetch(file.raw_url).then(res => res.json());
		return [{ classmap, version, timestamp }];
	}))).flat();

	await build(classmapInfos, Deno.args);
}
