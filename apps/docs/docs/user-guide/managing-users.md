---
title: "👨‍👩‍👧‍👦 Manage multiple user"
description: "In this document I explain how to manage users"
sidebar_position: 21
---

### Manage User

Click on your Avatar → Admin Area to navigate to your user panel.

The user panel is at the bottom of the page above the worker logs.

You can create, delete and manage users of your instance. You can change the scan path, password, name and e-mail of a given user.

**Please note:**
In LibrePhotos, the file system acts as the definitive source of photo organization. This means that folder structure dictates how photos are grouped and accessed within the application.

To isolate users and their photo collections, create a subfolder for each user inside the folder you set as `scanDirectory` in your `.env` file — the folder LibrePhotos mounts as `/data`. Inside LibrePhotos these show up as `/data/user1`, `/data/user2`, etc., and that is the path you assign as each user's scan directory. Create the folders before assigning them: LibrePhotos only accepts directories that already exist under `/data`. This ensures that users only see and interact with the photos in their designated directories.

Scan directories of different users must not overlap. Every photo belongs to exactly one user, so LibrePhotos refuses a scan directory that is the same as, inside, or above another user's scan directory, and names the user it clashes with. In particular, once one user scans `/data` itself, no other user can be given any folder under `/data`, so give every user a folder of their own, the admin included. Installations that already have overlapping scan directories keep working and those users can still be edited; only changing a scan directory to one that overlaps is refused.

If your admin account already scans `/data` and you want to add more users, move the admin's photos into a subfolder such as `/data/admin`, set that as the admin's scan directory and run a scan. The moved photos are matched to their existing entries by their content, so ratings, faces and albums are kept; see [Missing Photos](./missing-photos.md) for how that relinking works.

To let several users see the same photos, keep the photos in one user's library and share them from there: albums and individual photos can be shared with other users on the instance, see [Sharing](./sharing.md). To give someone the whole library to work in, not just what you share, make them a member of it; see [Working in another user's library](#working-in-another-users-library).

While the application saves metadata (e.g., tags, albums, facial recognition data) on a per-user basis in its database, it doesn’t inherently restrict access to the photos themselves. Access permissions must be managed through the file system / paths.

The separation will also not keep the photos "private" as the admin of the host system can see all the images.

## Working in another user's library

:::note
Library members are not in a release yet; they ship with the first release after 1.2.1.
:::

Sharing gives another user a read-only view of the photos and albums you pick, on their Sharing page. To give someone, such as a partner, the whole library instead, make their account a member of yours: Admin Area → edit the user → **Library** → pick "*yourname*'s library", then save. The users table then shows "Works in *yourname*'s library" in place of their scan directory.

A member signs in with their own name and password, and then works in the owner's library as if it were theirs:

- They see everything in it: the timeline, albums, people, places, tags, search, the trash, the Library page, and photos added later.
- They can change it the same way the owner can: add and remove tags, edit captions, put photos in albums, hide or delete photos, upload. These changes belong to the photos, so the owner sees them too, and the other way round.
- Their **favorites are their own**. A favorite is a rating of at least the account's minimum favorite rating, and a member's ratings are kept apart from the owner's: starring a photo stars it only for the person who did it, the Favorites page and the favorites filter show each person's own, and resolving duplicates keeps each person's highest rating. Only the owner's rating is written into the photo file's metadata.
- Their account stays their own: their profile, password and settings, such as the minimum favorite rating and the default timeline filter. Settings about how the library is run (scan directory, face recognition, metadata writing) are the owner's, and only the owner can change them.
- Membership never makes anyone an admin. A member who is not an admin has no Admin Area, and an admin owner's rights do not carry over to the member.

Only an admin can make a user a member or take them out again (**Library** → "Their own library"). Membership is one level deep: a library's owner cannot be a member of another library, and a user that others work with cannot join someone else's. A member's own photos, if they had any, stay in the database but are not shown while they are a member; they come back when the membership ends. If the owner's account is deactivated or deleted, the member is back in their own library.

## Upload folder

:::note
The upload folder setting is not in a release yet. It ships with the next LibrePhotos version.
:::

Photos uploaded through the web interface are written to an `uploads` folder inside the user's scan directory, in a subfolder per device: `/data/user1/uploads/web/`. The user edit dialog in the Admin Area shows the folder web uploads land in under the scan directory.

To put a user's uploads somewhere else, pick a folder in the **Upload folder** field of the same dialog. It is checked like a scan directory: it must already exist under `/data`, and it must not be inside, above or the same as another user's scan directory or another user's upload folder. A folder inside the user's own scan directory is fine. Uploaded photos are scanned into the uploader's library, so an upload folder counts as part of that user's files: the same rule also refuses a scan directory that is inside, above or the same as another user's upload folder, and the error names the user and whether it clashes with their library or their upload folder. As with scan directories, a value that already overlaps is kept when you save the user without changing it. Uploads then go to `<upload folder>/web/`. Clear the field to go back to the default.

Uploaded photos always belong to the user who uploaded them. If the upload folder is outside the user's scan directory, the photos still show up in their library, but a scan of the scan directory does not look in that folder and the folder view does not list it.

## Giving each user their own folder automatically

Admin Area → Site settings has a **Create a folder for each new user** switch, off by default. With it on, creating a user — from the admin panel, from self registration, or through single sign-on — also creates `/data/<username>` and assigns it as that user's scan directory, so you no longer have to make the folder on the host and assign it by hand for every account.

It only works when your own scan directory is a subfolder such as `/data/admin`, not `/data` itself. Scan directories of different users cannot overlap (see above), so while any user scans `/data`, every `/data/<username>` folder is refused.

What it deliberately does not do:

- It never overwrites a scan directory you typed on the create form. An explicit path wins.
- It never fails account creation. If `/data` is read-only, the username does not name a plain folder (such as `.` or `..`), or the folder would overlap a directory another user already scans, the account is still created — just without a scan directory — and the reason is written to the backend log. Nothing is created on disk in that case. Assign a directory by hand afterwards.
- It does not give a self-registered or single sign-on account a folder that already exists. Otherwise anyone who can sign up could take over, say, `/data/family` just by choosing `family` as their username. Such an account is created without a scan directory instead. When **you** create a user in the admin panel and `/data/<username>` already exists, that folder is assigned, since you can see what is in it.
- It does not touch existing users. Only accounts created while the switch is on get a folder.

## User Registration

Click on your Avatar → Admin Area to the user registration setting.

You can also activate user registration, where user can create an account themselves. They cannot change the path, which means the admin is still in full control.

Unless [Create a folder for each new user](#giving-each-user-their-own-folder-automatically) is on, a self-registered account is created without a scan directory, so the new user sees an empty library and is told to contact their administrator if they try to scan or upload. After someone signs up, open the Admin Area, edit their account in the user panel at the bottom of the page and set its scan path as described above.

## How to change the admin password, when you can't log in

There are three ways to accomplish that:

- 1. If your `.env` sets the admin credentials, the password is reset every time the backend container starts. The keys are `userName`, `userPass` and `adminEmail` (passed to the backend as `ADMIN_USERNAME`, `ADMIN_PASSWORD` and `ADMIN_EMAIL`), and both the username and password must be non-empty. They are not in the shipped `librephotos.env` template, so add them yourself — see [Admin account variables](../installation/environment-variables.md#admin-account-variables) for the full behaviour.
- 2. If you have access to your container, you can change the password by executing a Django management command `docker exec -it [backend container name] python manage.py changepassword [admin username]`
- 3. If outgoing e-mail is configured on your instance, the login page shows a **Forgot your password?** link that e-mails a reset link to the address on your account. This only works once e-mail is set up (Admin Area → Site settings → Email) and the account has an e-mail address, so arrange both *before* you get locked out. Behind the bundled proxy, also set `frontendBaseUrl` in your `.env` (passed to the backend as `FRONTEND_BASE_URL`) so the emailed link points at your public address rather than the internal one.
