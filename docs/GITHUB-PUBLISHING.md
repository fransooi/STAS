# Publier et protéger STAS sur Internet — mode d'emploi

> Ceci n'est **pas un avis juridique**. Pour tout ce qui est engageant :
> un avocat en propriété intellectuelle, ou l'INPI.

L'idée : ton droit d'auteur existe **automatiquement** (France/UE, convention de
Berne). Il ne s'agit donc pas d'« acquérir » un droit, mais de **prouver la date
et la paternité**. Voici, dans l'ordre, ce qui est gratuit et solide.

## 1. Le dépôt public daté (déjà fait ✅)

Le dépôt `github.com:fransooi/STAS` est public : chaque commit est **daté** et
consultable. C'est déjà une preuve d'antériorité, et c'est gratuit.

Ajoute simplement les fichiers de paternité à la racine :

```
AUTHORS.md
NOTICE.md
LICENSE          (déjà présent, MIT © 2026 François Lionet)
```

## 2. Signer tes commits (la preuve forte)

Une signature cryptographique prouve que **c'est toi** qui as écrit, et quand.
Une seule fois :

```
git config --global user.signingkey <ta-clé>
git config --global commit.gpgsign true
```

Ensuite, chaque `git commit` est signé. GitHub affiche un badge « Verified ».
Sur GitHub, ajoute ta clé dans *Settings → SSH and GPG keys*.

## 3. Poser une version (release) taguée

Une release est une photo datée, publique et référençable :

```
git tag -s v0.1.0 -m "STAS 0.1.0"
git push origin v0.1.0
```

Puis, sur GitHub : *Releases → Draft a new release → tag v0.1.0*. Le zip source
est archivé par GitHub.

## 4. Horodater un dossier (optionnel, très solide)

Tu horodates l'**empreinte** (hash) d'une archive, ce qui prouve son existence à
l'instant T, sans rien publier du contenu. Deux options :

- **OpenTimestamps** (ancré dans Bitcoin, gratuit) :
  ```
  tar -czf stas.tar.gz .
  ots stamp stas.tar.gz
  ```
  (outil `ots` : opentimestamps.org)
- **Horodatage qualifié RFC 3161** auprès d'un prestataire de confiance
  (quelques euros).

## 5. Enveloppe Soleau (INPI) — complément français

Dépôt officiel d'une description + empreinte (service **e-Soleau**, ~15 €) :
c'est une preuve d'antériorité reconnue, mais elle ne remplace ni le droit
d'auteur ni les commits. https://www.inpi.fr

## 6. Publier le podcast

- Héberge les épisodes (Podcastics, Transistor, …) : chaque épisode a une
  **date de publication** dans le flux RSS, archivée automatiquement.
- Dépose une copie sur l'**Internet Archive** : troisième source de date,
  indépendante.
- Ajoute dans la description un lien vers le commit correspondant (tes show
  notes sont déjà dans `JOURNAL.md`).

## 7. Ce qu'il faut vérifier AVANT de tout afficher en public

- Le contrat **Jawx / Mandarin (1988)** : code et **marque** « STOS » t'ont-ils
  été cédés ? (voir `NOTICE.md`).
- La co-signature du STOS : *F. Lionet & C. Sotiropoulos*.
- Les licences des composants tiers embarqués.

Voilà. Une fois les points 1–3 faits, tu as une preuve **gratuite, datée,
vérifiable et publique** — sans avoir eu à taper quoi que ce soit de compliqué.
