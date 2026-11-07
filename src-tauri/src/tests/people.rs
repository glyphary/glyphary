//! People photo lookup tests.
//!
//! Responsibilities:
//! - Lock the frontmatter keys, quoting, folder matching, and ordering of
//!   the people photo scan.
//!
//! Contracts:
//! - A vault without a People folder yields an empty list.

use super::*;

#[test]
fn reads_the_first_picture_key_from_frontmatter() {
    assert_eq!(
        frontmatter_photo("---\nname: Jane\nphoto: \"[[jane.jpg]]\"\n---\nbody"),
        Some("[[jane.jpg]]".into())
    );
    assert_eq!(
        frontmatter_photo("---\r\nAvatar: 'Attachments/j.png'\r\n---\r\n"),
        Some("Attachments/j.png".into())
    );
    assert_eq!(frontmatter_photo("---\nphoto:\n---\n"), None);
    assert_eq!(frontmatter_photo("no frontmatter\nphoto: x.png"), None);
    assert_eq!(frontmatter_photo("---\nname: x\n---\nphoto: after.png"), None);
}

#[test]
fn lists_people_with_pictures_under_any_case_people_folder() {
    let root = test_root();
    let vault = root.to_string_lossy().into_owned();

    assert!(read_people_photos(vault.clone()).unwrap().is_empty());

    fs::create_dir_all(root.join("people/Team")).unwrap();
    fs::write(root.join("people/Jane Doe.md"), "---\nphoto: \"[[jane.jpg]]\"\n---\n").unwrap();
    fs::write(root.join("people/Team/Marcin.md"), "---\nimage: marcin.png\n---\n").unwrap();
    fs::write(root.join("people/No Photo.md"), "---\nrole: x\n---\n").unwrap();
    fs::write(root.join("Elsewhere.md"), "---\nphoto: \"[[x.jpg]]\"\n---\n").unwrap();

    let photos = read_people_photos(vault).unwrap();
    let pairs: Vec<(String, String)> = photos
        .into_iter()
        .map(|photo| (photo.relative_path, photo.photo))
        .collect();

    assert_eq!(
        pairs,
        vec![
            ("people/Jane Doe.md".to_string(), "[[jane.jpg]]".to_string()),
            ("people/Team/Marcin.md".to_string(), "marcin.png".to_string()),
        ]
    );

    fs::remove_dir_all(root).unwrap();
}
