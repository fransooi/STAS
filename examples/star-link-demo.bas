10 REM =======================================================
20 REM * STARLINK & ULTRASOUND DEMO - PAR FRANCOIS LIONET    *
30 REM * VERSION STOS BASIC COMPLIANT (SANS EXTENSION)       *
40 REM =======================================================
50 mode 0 : flash off : key off : hide : click off : REM Basse res, pas de clignotement [6-10]
60 reserve as screen 5 : REM Reserve l'ecran logique temporaire en banque 5 [11, 12]
70 logic=start(5) : REM Definit l'adresse de travail sur la banque 5 [3, 13]
80 goto 1000 : REM Saute à l'initialisation et au menu principal

1000 REM --- PAGE 1 : ECRAN DE TITRE ---
1010 cls : screen swap : cls : REM Nettoyage des deux tampons d'ecran [2, 14, 15]
1020 XP=20 : DX=2 : REM Variables d'animation du satellite (XP, DX)
1030 repeat
1040   cls : REM Efface le tampon logique [3, 15]
1050   REM Dessin du cadre retro de l'article Medium
1060   ink 2 : rbox 10,10 to 310,190 : REM Cadre externe rouge/bleu [16, 17]
1070   ink 1 : rbox 12,12 to 308,188 : REM Cadre interne
1080   REM Textes de l'ecran de titre [18, 19]
1090   pen 3 : locate 4,4 : centre "STARLINK ENGINEERING"
1100   pen 2 : locate 6,6 : centre "LA MAGIE DE LA RESONANCE"
1110   pen 1 : locate 12,11 : centre "Francois Lionet Edition"
1120   pen 4 : locate 18,17 : centre "PRESSEZ ESPACE"
1130   REM Animation du satellite orbital au-dessus de la Terre
1140   ink 3 : circle XP,30,5 : REM Corps du satellite [20]
1150   ink 4 : draw XP-12,30 to XP+12,30 : REM Panneaux solaires [21]
1160   XP=XP+DX
1170   if XP>290 or XP<30 then DX=-DX
1180   wait vbl : screen swap : REM Synchronisation et affichage du tampon [2, 4, 14]
1190   A$=inkey$ : REM Verification d'appui touche [22]
1200 until A$=" "
1210 play 1,12,10 : REM Un petit son retro de validation ! [23, 24]

2000 REM --- PAGE 2 : LE FAISCEAU STARLINK (TSUNAMI D'ONDES) ---
2010 cls : screen swap : cls : REM Reset complet des deux ecrans
2020 T=0 : REM Compteur de temps
2030 repeat
2040   cls
2050   pen 3 : locate 2,2 : centre "THEORIE DU PHASED ARRAY"
2060   pen 1 : locate 4,4 : centre "L'effet Tsunami d'ondes"
2070   pen 2 : locate 18,13 : centre "Les ondes se dephasent"
2080   pen 2 : locate 19,10 : centre "et s'alignent en un faisceau !"
2090   pen 4 : locate 23,22 : centre "Espace: Suivant"
2100   REM Dessin de l'antenne au sol
2110   ink 2 : bar 80,165 to 240,170 : REM La parabole plate [25]
2120   REM Animation des ondes de phase coherentes (13 sous-antennes)
2130   for I=0 to 12
2140     XE=85+I*12 : REM Calcul coordonnee X de la sous-antenne [26]
2150     REM Introduction du delai de phase (dephasage de I * 3 frames)
2160     R=T-I*3
2170     if R>0 and R<110 then ink 1 : circle XE,165,R : REM Onde en expansion [20]
2180   next I
2190   REM Dessin du front d'onde combine constructif (le Tsunami de 1.6 degres !)
2200   if T>45 then ink 3 : draw 85+(T-45)*0.8,165-(T-45) to 230+(T-45)*0.8,165-(T-45)-25 : REM [21]
2210   T=T+1
2220   if T>140 then T=0
2230   wait vbl : screen swap
2240   A$=inkey$
2250 until A$=" "
2260 play 1,24,10

3000 REM --- PAGE 3 : GRILLE ULTRASONS (HAPTIQUE 3D & CHIRURGIE) ---
3010 cls : screen swap : cls
3020 T=0
3030 HX=160 : HY=70 : REM Coordonnees de la main (HX, HY)
3040 HDX=2 : HDY=1 : REM Vitesse de deplacement de la main (HDX, HDY)
3050 repeat
3060   cls
3070   pen 3 : locate 2,2 : centre "GRILLE ULTRASONS 16x16"
3080   pen 1 : locate 4,4 : centre "Haptique Aerienne & Chirurgie 3D"
3090   pen 2 : locate 18,12 : centre "Le point de pression 3D"
3100   pen 2 : locate 19,13 : centre "suit la main en temps reel !"
3110   pen 4 : locate 23,22 : centre "Espace: Recommencer"
3120   REM Dessin de la grille 16x16 en perspective 3D
3130   ink 1
3140   for I=0 to 16
3150     REM Lignes de fuite de la perspective
3160     draw 60+I*12,160 to 100+I*7,125 : REM Lignes de fuite de la perspective [21]
3170     REM Lignes horizontales de la grille piézoelectrique
3180     draw 60+I*1.5,160-I*2 to 252-I*1.5,160-I*2
3190   next I
3200   REM Deplacement de la main
3210   HX=HX+HDX : HY=HY+HDY
3220   if HX>220 or HX<100 then HDX=-HDX
3230   if HY>95 or HY<55 then HDY=-HDY
3240   REM Dessin stylise d'une main d'utilisateur
3250   ink 2
3260   circle HX,HY,10 : REM Paume de la main [20]
3270   draw HX-10,HY to HX-15,HY-12 : REM Pouce [21]
3280   draw HX-5,HY-10 to HX-5,HY-22 : REM Index
3290   draw HX,HY-10 to HX,HY-24 : REM Majeur
3300   draw HX+5,HY-10 to HX+5,HY-20 : REM Annulaire
3310   draw HX+10,HY-5 to HX+15,HY-15 : REM Auriculaire
3320   REM Dessin du point focal acoustique (vibration haptique)
3330   REM Il oscille rapidement en taille grace a (T mod 3)
3340   ink 3
3350   R=(T mod 3)*3+3
3360   circle HX,HY+15,R
3370   REM Dessin des faisceaux convergents focalisant l'energie acoustique
3380   ink 1
3390   draw 100,125 to HX,HY+15
3400   draw 212,125 to HX,HY+15
3410   draw 60,160 to HX,HY+15
3420   draw 252,160 to HX,HY+15
3430   REM Simulation du son de vibration (micro-pulsations)
3440   if (T mod 8)=0 then play 1,88,1 : REM Un petit "clic" aigu de 40 kHz simule [23, 24]
3450   T=T+1
3460   wait vbl : screen swap
3470   A$=inkey$
3480 until A$=" "
3490 goto 1000 : REM Reboucle au debut du programme
