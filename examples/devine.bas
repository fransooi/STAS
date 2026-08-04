10 ' Le jeu du nombre — devinez entre 1 et 100
20 cls
30 print "=== Le jeu du nombre ==="
40 n=int(rnd(100))+1
50 essais=0
60 while c<>n
70 input "Un nombre entre 1 et 100 ? ";c
80 essais=essais+1
90 if c<n then print "Trop petit !"
100 if c>n then print "Trop grand !"
110 wend
120 print "Bravo ! Trouvé en ";essais;" essais."
